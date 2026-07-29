import { useEffect, useState, useMemo, useCallback } from 'react'
import NotificationItem from './components/NotificationItem'
import useNotificationStore, {
  PAGE_SIZE,
  selectItems,
  selectLoading,
  selectOnlyUnread,
} from './store'
import { HiChevronDoubleDown, HiChevronDoubleUp, HiOutlineBell, HiOutlineBellAlert, HiOutlineRectangleStack, HiOutlineCheckCircle } from 'react-icons/hi2'
import SectionHeader from '../../../infra/shared/components/SectionHeader'
import EmptyState from '../../../infra/shared/components/EmptyState'
import { useI18n } from '../../../infra/locales/I18nContext'


export default function NotificationPage() {
  const { t } = useI18n()
  const items = useNotificationStore(selectItems)
  const loading = useNotificationStore(selectLoading)
  const onlyUnread = useNotificationStore(selectOnlyUnread)
  const total = useNotificationStore((s) => s.total)
  const fetchPage = useNotificationStore((s) => s.fetchPage)
  const getSummary = useNotificationStore((s) => s.getSummary)
  const setOnlyUnread = useNotificationStore((s) => s.setOnlyUnread)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const markAllReadByModule = useNotificationStore((s) => s.markAllReadByModule)
  const groupNotifications = useNotificationStore(s => s.groupNotifications)
  const removeLastGroupNotificationItems = useNotificationStore(s => s.removeLastGroupNotificationItems)
  const expandedGroups = useNotificationStore(s => s.expandedGroups)
  const toggleGroup = useNotificationStore(s => s.toggleGroup)

  
  useEffect(() => {
    getSummary()
  }, [getSummary])

  const isLoading = loading && items.length === 0

  return (
    <div className="flex flex-col h-full gap-3">
      <SectionHeader
        icon={<HiOutlineBell />}
        title="Notifications"
        description={total > 0 ? `${total} total` : 'No notifications yet'}
        actions={
          <button
            type="button"
            onClick={() => markAllRead()}
            className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            disabled={items.every((n) => n.read_at)}
          >
            Mark all read
          </button>
        }
      />

      <label className="inline-flex items-center gap-2 text-sm text-[var(--text-2)] mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={onlyUnread}
          onChange={(e) => {
            setOnlyUnread(e.target.checked);
            // reset expanded
            //setExpandedGroups(new Set())
          }}
          className="w-4 h-4 accent-[var(--accent)]"
        />
        Show only unread
      </label>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-[var(--text-2)]">Loading…</div>
        ) : groupNotifications.length === 0 ? (
          <EmptyState
            fill
            bare
            icon={<HiOutlineBell />}
            title={onlyUnread ? t('empty.notifications.titleUnread') : t('empty.notifications.titleDefault')}
            description={t('empty.notifications.description')}
            hints={[
              { icon: <HiOutlineBellAlert />, title: t('empty.notifications.stayInformedTitle'), description: t('empty.notifications.stayInformedDesc') },
              { icon: <HiOutlineRectangleStack />, title: t('empty.notifications.groupedTitle'), description: t('empty.notifications.groupedDesc') },
              { icon: <HiOutlineCheckCircle />, title: t('empty.notifications.markReadTitle'), description: t('empty.notifications.markReadDesc') },
            ]}
          />
        ) : (
          groupNotifications.map((g) => {
            const group = g.groupNotification
            const isExpanded = expandedGroups.has(group.source_module)
            const totalItem = g.items.length

            const notType = group.source_module
            return (
              <div key={notType} className="border-b border-[var(--border)] last:border-b-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    toggleGroup(notType);
                    if(g.items.length == 0){
                      fetchPage(group.source_module, 1)
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { toggleGroup(notType); if(g.items.length == 0) fetchPage(group.source_module, 1); }}}
                  className="w-full flex items-center justify-between p-4 background: var(--surface-2) hover:bg-[var(--surface-hover)] transition-colors text-left cursor-pointer"
                  aria-expanded={isExpanded}
                >
                <div style={{width:'100%'}}>
                  <NotificationItem
                    key={`{${group.source_module}}`}
                    notification={group}
                    isGroupType={true}
                    groupUnreadCount={g.unreadCount}
                    onMarkRead={() => markRead(g, group.id)}
                    onMarkAllRead={() => markAllReadByModule(group.source_module)}
                    onToggleGroup={toggleGroup}
                    isExpanded={isExpanded}
                  />
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {g.items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onMarkRead={() => markRead(g, n.id)}
                      />
                    ))}
                    {g.pages > 1 &&
                    <div className="w-full flex items-center justify-center pt-2 gap-2 cursor-pointer">   
                      {totalItem > PAGE_SIZE &&
                      <HiChevronDoubleUp 
                        className="hover:text-blue-500 transition-colors" 
                        onClick={() => removeLastGroupNotificationItems(group.source_module)} 
                      />
                      }
                      {totalItem < g.total &&
                      <HiChevronDoubleDown 
                        className="hover:text-blue-500 transition-colors" 
                        onClick={() => fetchPage(group.source_module, g.page + 1)} 
                      />
                      }
                    </div>
                    }
                  </div>
                )}                
              </div>
            )
          })
        )}
      </div>
   </div>
  )
}