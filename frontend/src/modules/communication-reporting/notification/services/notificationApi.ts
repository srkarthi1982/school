import { client } from '../../../../api/client';

import {
  listMyNotificationsApiV1NotificationGet,
  getUnreadCountApiV1NotificationUnreadCountGet,
  markOneReadApiV1NotificationNotificationIdReadPatch,
  markAllApiV1NotificationMarkAllReadPost,
  markAllByModuleApiV1NotificationByModuleSourceModuleMarkAllReadPost,
  getNotificationSummaryEndpointApiV1NotificationSummaryGet as getNotificationSummary,
  listNotificationsByModuleEndpointApiV1NotificationByModuleSourceModuleGet as listNotificationsByModule,
  SummaryNotificationResponse
} from '../../../../api/generated'; 

export interface NotificationDto {
  id: number;
  template_id: number;
  recipient_id: number;
  type: string;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  source_module: string;
  source_id: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SuccessEnvelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; page_size: number; total: number; pages: number };
}

interface ListParams {
  page?: number;
  pageSize?: number;
  onlyUnread?: boolean;
}

// Keeps your existing error/response unwrapping logic
async function unwrap<T>(promise: Promise<{ data?: unknown; error?: unknown }>): Promise<SuccessEnvelope<T>> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as SuccessEnvelope<T>;
}

export function listNotifications(params: ListParams = {}) {
  return unwrap<NotificationDto[]>(
    listMyNotificationsApiV1NotificationGet({query: {
      page: params.page,
      page_size: params.pageSize,
      only_unread: params.onlyUnread,
    }}),
  );
}

export function listNotificationSummary(onlyUnread:boolean) {

  const summary = getNotificationSummary({query:{only_unread:onlyUnread}})
  
  return unwrap<SummaryNotificationResponse[]>(summary)
}

export function fetchListNotificationsByModule(sourceModule:string, listParams: ListParams = {}) {
  return unwrap<NotificationDto[]>(
  listNotificationsByModule({
    path:{source_module:sourceModule}, 
    query:{
    page: listParams.page,
      page_size: listParams.pageSize,
      only_unread: listParams.onlyUnread,
  }})
);
}

export function getUnreadCount() {
  return unwrap<{ count: number }>(
    getUnreadCountApiV1NotificationUnreadCountGet(),
  );
}

export function markNotificationRead(id: number) {
  return unwrap<NotificationDto>(
    markOneReadApiV1NotificationNotificationIdReadPatch({path: {
      notification_id: id,
    }}),
  );
}

export function markAllNotificationsRead() {
  return unwrap<{ count: number }>(
    markAllApiV1NotificationMarkAllReadPost(),
  );
}

export function markAllNotificationsReadByModule(sourceModule: string) {
  return unwrap<{ count: number }>(
    markAllByModuleApiV1NotificationByModuleSourceModuleMarkAllReadPost({
      path: { source_module: sourceModule },
    }),
  );
}