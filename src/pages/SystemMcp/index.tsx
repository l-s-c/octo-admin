import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Input, Select, Space as AntSpace, Table, Tag } from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  listSystemMcps,
  type McpDetail,
  type McpListItem,
} from '../../api/mcp'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'
import McpDetailDrawer from './DetailDrawer'
import McpFormModal from './FormModal'
import './systemMcp.css'

const PAGE_SIZE = 20

/**
 * Admin page listing every visibility=system MCP across all Spaces (contract:
 * octo-marketplace/docs/api/mcp-v1.md §9). Follows the console-standard
 * layout of Users / Spaces: page-title header, toolbar with search + primary
 * action, dense antd Table with inline row-actions. Detail lives in a
 * Drawer (SpaceDetailDrawer pattern); create/edit share one Modal.
 */
export default function SystemMcp() {
  const { t } = useTranslation(['systemMcp', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'mcp.write')
  )

  const [rows, setRows] = useState<McpListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [transports, setTransports] = useState<string[]>([])
  const [verificationStatuses, setVerificationStatuses] = useState<string[]>([])
  const [sort, setSort] = useState('relevance')

  const [drawer, setDrawer] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<McpDetail | null>(null)
  const requestVersion = useRef(0)

  const load = async (nextPage = page, kw = keyword) => {
    const version = ++requestVersion.current
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await listSystemMcps({
        keyword: kw,
        categories,
        transports: transports as never[],
        verificationStatuses,
        sort,
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      })
      if (version !== requestVersion.current) return
      setRows(resp.items)
      setTotal(resp.total)
      setPage(nextPage)
    } catch (err) {
      if (version !== requestVersion.current) return
      const status = err instanceof ApiError ? err.status : undefined
      setRows([])
      setLoadError(status === 401 ? t('errors.auth') : status === 403 ? t('errors.forbidden') : status && status >= 500 ? t('errors.server') : t('errors.network'))
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    load(1, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const kw = pendingKeyword.trim()
      setKeyword(kw)
      load(1, kw)
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKeyword])

  useEffect(() => {
    load(1, keyword)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(','), transports.join(','), verificationStatuses.join(','), sort])

  const handleSearch = () => {
    const kw = pendingKeyword.trim()
    setKeyword(kw)
    load(1, kw)
  }

  const openDetail = (id: string) => setDrawer({ open: true, id })
  const closeDetail = () => setDrawer({ open: false, id: null })

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (detail: McpDetail) => {
    setDrawer({ open: false, id: null })
    setEditing(detail)
    setFormOpen(true)
  }

  const handleDeleted = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setTotal((prev) => Math.max(0, prev - 1))
    // If the last row on this page just disappeared and we're past page 1,
    // reload the previous page so the user isn't left staring at empty state.
    const isLastOnPage = rows.length === 1 && page > 1
    if (isLastOnPage) load(page - 1, keyword)
    closeDetail()
  }

  const handleSaved = (updated?: McpDetail) => {
    if (updated) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...r,
                name: updated.name,
                slogan: updated.slogan,
                category: updated.category,
                icon: updated.icon,
                tags: updated.tags,
                toolCount: updated.toolCount,
                creatorName: updated.creatorName,
              }
            : r
        )
      )
    } else {
      load(1, keyword)
    }
  }

  const columns = useMemo<ColumnsType<McpListItem>>(
    () => [
      {
        title: t('table.name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, r) => (
          <div className="mcp-cell-name">
            <span className="mcp-cell-name__icon">{r.icon || '🧩'}</span>
            <div className="mcp-cell-name__text">
              <span className="cell-primary">{name}</span>
              {r.slogan && <span className="mcp-cell-name__sub">{r.slogan}</span>}
            </div>
          </div>
        ),
      },
      {
        title: t('table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (v: string) => (
          <Tag className="pill-outline neutral">
            {t(`categoryOptions.${v}`, { defaultValue: v })}
          </Tag>
        ),
      },
      {
        title: t('table.tags'),
        dataIndex: 'tags',
        key: 'tags',
        width: 200,
        render: (tags: string[]) =>
          tags?.length ? (
            <AntSpace size={4} wrap>
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="pill-outline brand">
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="mcp-more">+{tags.length - 3}</span>
              )}
            </AntSpace>
          ) : (
            <span className="mcp-more">—</span>
          ),
      },
      {
        title: t('table.tools'),
        dataIndex: 'toolCount',
        key: 'toolCount',
        width: 80,
        align: 'right',
        render: (v: number) => <span className="mono">{v}</span>,
      },
      {
        title: t('table.creator'),
        dataIndex: 'creatorName',
        key: 'creatorName',
        width: 140,
        render: (v: string) => v || '—',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  )

  return (
    <div>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <p className="page-subtitle">{t('pageDesc')}</p>

      <div className="toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder={t('searchPlaceholder')}
          value={pendingKeyword}
          onChange={(e) => setPendingKeyword(e.target.value)}
          onPressEnter={handleSearch}
          onBlur={handleSearch}
          style={{ width: 280 }}
        />
        <Select mode="multiple" allowClear placeholder={t('filters.category')} value={categories} onChange={(v) => { setCategories(v); setPage(1) }} options={['dev','data','search','productivity','ai','other'].map((value) => ({ value, label: t(`categoryOptions.${value}`) }))} style={{ minWidth: 180 }} />
        <Select mode="multiple" allowClear placeholder={t('filters.transport')} value={transports} onChange={(v) => { setTransports(v); setPage(1) }} options={['stdio','streamable-http','sse'].map((value) => ({ value, label: t(`transportOptions.${value}`) }))} style={{ minWidth: 180 }} />
        <Select mode="multiple" allowClear placeholder={t('filters.verification')} value={verificationStatuses} onChange={(v) => { setVerificationStatuses(v); setPage(1) }} options={['verified','unverified','error'].map((value) => ({ value, label: t(`verificationOptions.${value}`) }))} style={{ minWidth: 160 }} />
        <Select value={sort} onChange={setSort} options={['relevance','updated','verified'].map((value) => ({ value, label: t(`sortOptions.${value}`) }))} style={{ width: 150 }} />
        <Button onClick={() => { setCategories([]); setTransports([]); setVerificationStatuses([]); setSort('relevance') }}>{t('filters.clear')}</Button>
        <div className="toolbar-spacer" />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => load(page, keyword)}
          loading={loading}
        />
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('create')}
          </Button>
        )}
      </div>

      <Table<McpListItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => load(page, keyword)}>{t('retry')}</Button>} /> : t('empty') }}
        onRow={(r) => ({
          onClick: () => openDetail(r.id),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => load(p, keyword),
        }}
      />

      <McpDetailDrawer
        mcpId={drawer.id}
        open={drawer.open}
        onClose={closeDetail}
        canManage={canWrite}
        onEdit={openEdit}
        onDeleted={handleDeleted}
      />

      <McpFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
