import { create } from 'zustand'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markAllNotificationsReadByModule,
  markNotificationRead,
  listNotificationSummary,
  fetchListNotificationsByModule,
  type NotificationDto,
} from './services/notificationApi'
import { notificationSocket, type NotificationEvent } from './services/notificationSocket'
import useToastStore from '../../../infra/shared/store/useToastStore'

export const PAGE_SIZE = 5

interface GroupNotification {
  groupId: string
  groupNotification: NotificationDto
  items: NotificationDto[]
  unreadCount: number
  page: number
  pages: number
  total: number
}

interface NotificationState {
  items: NotificationDto[]
  unreadCount: number
  total: number
  onlyUnread: boolean
  loading: boolean
  socketSubscribed: boolean
  groupNotifications: GroupNotification[]
  shownToastIds: Set<number>
  expandedGroups: Set<string>

  fetchPage: (sourceModule:string, page?: number, onlyUnread?: boolean) => Promise<void>
  refreshUnreadCount: () => Promise<void>
  setOnlyUnread: (value: boolean) => Promise<void>
  markRead: (group:GroupNotification, messageId: number) => Promise<void>
  markAllRead: () => Promise<void>
  markAllReadByModule: (sourceModule: string) => Promise<void>
  bindSocket: () => void
  reset: () => void
  getSummary:() => void
  removeLastGroupNotificationItems:(groupId: string, itemCount?:number) => void
  toggleGroup:(s:string) => void
}

const useNotificationStore = create<NotificationState>((set, get) => {
  const addGroupNotificationItems = (groupId: string, items:NotificationDto[], page:number, pages:number, total:number) => {
    set((state) => {
      // Find the index of the target group
      const groupIndex = state.groupNotifications.findIndex((g) => g.groupId === groupId);

      // If the group doesn't exist, return state unchanged
      if (groupIndex === -1) {
        return state;
      }

      // Create a NEW array for the group's items (immutable update)
      const updatedGroupItems = [...state.groupNotifications[groupIndex].items, ...items];

      // Create a new group object with the updated items
      const updatedGroup = {
        ...state.groupNotifications[groupIndex],
        items: updatedGroupItems,
        page, pages, total
      };

      // Update the parent array immutably using slice (avoids mapping over every item)
      const updatedGroups = [
        ...state.groupNotifications.slice(0, groupIndex),
        updatedGroup,
        ...state.groupNotifications.slice(groupIndex + 1),
      ];

      // Return the new state reference
      return { groupNotifications: updatedGroups };
    });
  }
  const updateGroupNotificationItems = (groupId: string, items:NotificationDto[], page?:number, pages?:number, total?:number, unreadCount?:number) => {
    set((state) => {
      // Find the index of the target group
      const groupIndex = state.groupNotifications.findIndex((g) => g.groupId === groupId);

      // If the group doesn't exist, return state unchanged
      if (groupIndex === -1) {
        return state;
      }

      // Create a new group object with the updated items
      const updatedGroup = {
        ...state.groupNotifications[groupIndex],
        items
      };
      
      if(page != null) updatedGroup.page = page;
      if(pages != null) updatedGroup.pages = pages;
      if(total != null) updatedGroup.total = total;
      if(unreadCount != null) updatedGroup.unreadCount = unreadCount;

      // Update the parent array immutably using slice (avoids mapping over every item)
      const updatedGroups = [
        ...state.groupNotifications.slice(0, groupIndex),
        updatedGroup,
        ...state.groupNotifications.slice(groupIndex + 1),
      ];

      // Return the new state reference
      return { groupNotifications: updatedGroups };
    });
  };

return {
    items: [],
    unreadCount: 0,
    total: 0,
    onlyUnread: false,
    loading: false,
    socketSubscribed: false,
    groupNotifications: [],
    shownToastIds: new Set<number>(),
    expandedGroups: new Set<string>(),

    fetchPage: async (sourceModule, page = 1, onlyUnread) => {
      const useUnread = onlyUnread ?? get().onlyUnread
      set({ loading: true })
      try {
        const res = await fetchListNotificationsByModule(sourceModule, { page, pageSize: PAGE_SIZE, onlyUnread: useUnread })
        const meta = res.meta
        const prevItems = get().items
        const resItems = res.data ?? []
        const pages = meta?.pages ?? 1
        const total = meta?.total ?? 0
        set({
          items: [...prevItems, ...resItems],
          onlyUnread: useUnread,
          loading: false,
        })
        if(page == 1){
          updateGroupNotificationItems(sourceModule, resItems, page, pages, total)
        } else {
          addGroupNotificationItems(sourceModule, resItems, page, pages, total)
        }
      } catch (err) {
        console.error('[notification] fetchPage failed', err)
        set({ loading: false })
      }
    },

    refreshUnreadCount: async () => {
      try {
        const res = await getUnreadCount()
        set({ unreadCount: res.data?.count ?? 0 })
      } catch (err) {
        console.error('[notification] refreshUnreadCount failed', err)
      }
    },

    setOnlyUnread: async (value) => {
      set({onlyUnread:value})
      await get().getSummary()
    },

    markRead: async (group, id) => {
      try {
        await markNotificationRead(id)
        // Notify server-side WS too so other tabs sync
        notificationSocket.send({ type: 'read', id })

        // update group and item states
        const before = group.items.find((n) => n.id === id)
        const onlyUnread = get().onlyUnread;
        if (before && !before.read_at) {
          const now = new Date().toISOString()
          const items = group.items
          const updatedItems = onlyUnread ? items.filter(x => x.id != id) : items.map((n) => (n.id === id ? { ...n, read_at: now } : n));
          if(updatedItems.length == 0){
            // remove group
            set((state) => {
              // Find the index of the target group
              const groupIndex = state.groupNotifications.findIndex((g) => g.groupId === group.groupId);

              // If the group doesn't exist, return state unchanged
              if (groupIndex === -1) {
                return state;
              }

              // Update the parent array immutably using slice (avoids mapping over every item)
              const updatedGroups = [
                ...state.groupNotifications.slice(0, groupIndex),
                ...state.groupNotifications.slice(groupIndex + 1),
              ];

              // Return the new state reference
              return { groupNotifications: updatedGroups };
            });          
          } else {
            updateGroupNotificationItems(group.groupId, updatedItems, undefined, undefined, undefined, group.unreadCount - 1);
          }
        }
      } catch (err) {
        console.error('[notification] markRead failed', err)
        // Roll back on failure
        await get().refreshUnreadCount()
      }
    },

    markAllRead: async () => {
      const now = new Date().toISOString()
      set((state) => {
        const updatedGroups = state.groupNotifications.map((g) => ({
          ...g,
          unreadCount: 0,
          items: g.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
        }))
        return {
          items: state.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
          groupNotifications: updatedGroups,
          unreadCount: 0,
        }
      })
      try {
        const res = await markAllNotificationsRead()
        notificationSocket.send({ type: 'mark_all_read' })
        await get().getSummary()
        await get().refreshUnreadCount()
      } catch (err) {
        console.error('[notification] markAllRead failed', err)
        await get().refreshUnreadCount()
      }
    },

    markAllReadByModule: async (sourceModule: string) => {
      const now = new Date().toISOString()
      set((state) => {
        const updatedGroups = state.groupNotifications.map((g) => {
          if (g.groupNotification.source_module !== sourceModule) return g
          return {
            ...g,
            unreadCount: 0,
            items: g.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
          }
        })
        return {
          groupNotifications: updatedGroups,
          unreadCount: updatedGroups.reduce((sum, g) => sum + g.unreadCount, 0),
        }
      })
      try {
        const res = await markAllNotificationsReadByModule(sourceModule)
        notificationSocket.send({ type: 'mark_all_read_by_module', source_module: sourceModule })
        await get().getSummary()
        await get().refreshUnreadCount()
      } catch (err) {
        console.error('[notification] markAllReadByModule failed', err)
        await get().refreshUnreadCount()
      }
    },

    bindSocket: () => {
      const currentSubscribed = get().socketSubscribed
      if (currentSubscribed) {
        return
      }
      set({ socketSubscribed: true })
      notificationSocket.subscribe(async (event: NotificationEvent) => {
        if (event.type === 'connection.ready') {
          set({ unreadCount: event.unread_count })
          await get().getSummary()
        } else if (event.type === 'notification.new') {
          const incoming = event.notification
          set((s) => {
            const exists = s.items.some((n) => n.id === incoming.id)
            if (exists) return s
            const showOnList = (!s.onlyUnread || !incoming.read_at)
            return {
              items: showOnList ? [incoming, ...s.items].slice(0, PAGE_SIZE) : s.items,
              unreadCount: s.unreadCount + (incoming.read_at ? 0 : 1),
              total: s.total + 1,
            }
          })
          const incomingModule = incoming.source_module
          set((s) => {
            const groupId = incomingModule
            const isExpanded = s.expandedGroups.has(groupId)
            const updated = s.groupNotifications.map((g) => {
              if (g.groupNotification.source_module === incomingModule) {
                const newItems = isExpanded ? [incoming, ...g.items] : g.items
                return {
                  ...g,
                  unreadCount: g.unreadCount + 1,
                  items: newItems,
                  groupNotification: { ...g.groupNotification, ...incoming },
                }
              }
              return g
            })
            return { groupNotifications: updated }
          })
          if (!incoming.read_at && !window.location.pathname.endsWith('/notification')) {
            const alreadyShown = get().shownToastIds.has(incoming.id)
            if (!alreadyShown) {
              set((s) => ({ shownToastIds: new Set([...s.shownToastIds, incoming.id]) }))
              const { source_module, link, payload } = incoming
              const conversationId = payload?.conversation_id as string | undefined
              const scheduleId = payload?.schedule_id as string | undefined
              let targetUrl = link ?? ''
              if (source_module === 'chat' && conversationId) {
                targetUrl = `${link}?conversation=${encodeURIComponent(conversationId)}`
              } else if (source_module === 'schedule' && scheduleId) {
                targetUrl = `${link}?schedule=${encodeURIComponent(scheduleId)}`
              }
              console.log('[notification] toast payload:', JSON.stringify(payload), 'conversationId:', conversationId, 'targetUrl:', targetUrl)
              useToastStore.getState().push({
                variant: 'info',
                title: incoming.title ?? 'New notification',
                body: incoming.body ?? undefined,
                onClick: targetUrl ? () => { console.log('[notification] toast onClick navigating to:', targetUrl); window.location.href = targetUrl } : undefined,
              })
            }
          }
        } else if (event.type === 'notification.read') {
          set((s) => ({
            items: s.items.map((n) => (n.id === event.id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
          }))
          await get().refreshUnreadCount()
        } else if (event.type === 'notification.all_read') {
          const now = new Date().toISOString()
          set((s) => {
            const updatedGroups = s.groupNotifications.map((g) => ({
              ...g,
              unreadCount: 0,
              items: g.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
            }))
            return {
              items: s.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
              groupNotifications: updatedGroups,
              unreadCount: 0,
            }
          })
          await get().refreshUnreadCount()
        } else if (event.type === 'notification.all_read_by_module') {
          const now = new Date().toISOString()
          set((s) => {
            const updated = s.groupNotifications.map((g) => {
              if (g.groupNotification.source_module !== event.source_module) return g
              return {
                ...g,
                unreadCount: 0,
                items: g.items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
              }
            })
            return {
              groupNotifications: updated,
              unreadCount: updated.reduce((sum, g) => sum + g.unreadCount, 0),
            }
          })
          await get().refreshUnreadCount()
        }
      })
    },

    reset: () => set({
      items: [], unreadCount: 0, total: 0,
      onlyUnread: false, loading: false,
      shownToastIds: new Set<number>(),
      socketSubscribed: false,
      expandedGroups: new Set<string>(),
    }),

    toggleGroup: (type: string) => {
      set((state) => {
        const next = new Set(state.expandedGroups)
        if (next.has(type)) next.delete(type)
        else next.add(type)
        return { expandedGroups: next }
      })
    },

getSummary:async () => {
      try {
        const res = await listNotificationSummary(get().onlyUnread);
        const data = res.data ?? [];
        const unreadCountSummary = new Map<string, number>();
        let totalCount = 0;
        let totalUnread = 0;
        
        data.forEach(x => {
          if (x.notification?.source_module) {
            unreadCountSummary.set(x.notification.source_module, x.unread_count);
            totalCount += x.total_count;
            totalUnread += x.unread_count;
          }          
        });

        // Transform to GroupNotification[] format
        const groupNotifications: GroupNotification[] = data.map((x) => ({
          groupId: x.notification?.source_module ?? 'unknown',
          groupNotification: x.notification,
          items:  [], // Keep if your interface requires it
          unreadCount: x.unread_count,
          page:0, pages:0, total:0      
        }));

        // Update store atomically
        set((state) => ({
          groupNotifications: groupNotifications.map((g) => {
            const existing = state.groupNotifications.find((eg) => eg.groupId === g.groupId)
            return existing ? { ...g, items: existing.items } : g
          }),
          total: totalCount,
          unreadCount: totalUnread,
        }))
      } catch (error) {
        console.error('Failed to fetch notification summary:', error);      
      }
    },
        
    removeLastGroupNotificationItems: (groupId: string) => {
        set((state) => {
          // Find target group index
          const groupIndex = state.groupNotifications.findIndex((g) => g.groupId === groupId);
          if (groupIndex === -1) return state; // Group doesn't exist → return unchanged state

          const group = state.groupNotifications[groupIndex];
          
          // Calculate how many items to keep (clamp to 0 to prevent negative slice indices)
          const removeCount = group.page == group.pages && (group.total % PAGE_SIZE > 0) ? group.total % PAGE_SIZE : PAGE_SIZE
          const keepCount = Math.max(0, group.items.length - (removeCount));

          // Early return if nothing was actually removed (avoids unnecessary state updates)
          if (keepCount === group.items.length) return state;

          // Create new items array immutably
          const updatedItems = group.items.slice(0, keepCount);

          // Create updated group object
          const updatedGroup = { ...group, items: updatedItems, page: group.page - 1 };

          // Update parent array immutably 
          const updatedGroups = [
            ...state.groupNotifications.slice(0, groupIndex),
            updatedGroup,
            ...state.groupNotifications.slice(groupIndex + 1),
          ];

          // 7. Return new state reference
          return { groupNotifications: updatedGroups };
        });
    },

    
  }
})

export const selectItems = (s: NotificationState) => s.items
export const selectUnreadCount = (s: NotificationState) => s.unreadCount
export const selectLoading = (s: NotificationState) => s.loading
export const selectOnlyUnread = (s: NotificationState) => s.onlyUnread

export default useNotificationStore
