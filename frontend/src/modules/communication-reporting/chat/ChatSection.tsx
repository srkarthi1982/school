import { useState } from 'react'
import { useI18n } from '../../../infra/locales/I18nContext'
import useChatStore from './chat-store'
import ConversationList from './components/ConversationList'
import ChatThread from './components/ChatThread'
import NewChatModal from './components/NewChatModal'

export default function ChatSection() {
  const { t } = useI18n()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSelect = (id: string) => {
    useChatStore.getState().setActiveConversation(id)
  }

  return (
    <>
      <div className="flex gap-4 h-full min-h-0">
        <div className="w-[300px] shrink-0 flex flex-col min-h-0">
          <ConversationList
            onNewChat={() => setPickerOpen(true)}
            onSelect={handleSelect}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <ChatThread
            emptyTitle={t('chat.emptyThreadTitle')}
            emptyHint={t('chat.emptyThreadHint')}
            composerPlaceholder={t('chat.composerPlaceholder')}
            sendLabel={t('chat.send')}
            onlineLabel={t('chat.online')}
            offlineLabel={t('chat.offline')}
            typingLabel={t('chat.typing')}
            todayLabel={t('chat.today')}
            yesterdayLabel={t('chat.yesterday')}
          />
        </div>
      </div>
      <NewChatModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConversationOpened={(id) => useChatStore.getState().setActiveConversation(id)}
        title={t('chat.newConversation')}
        searchPlaceholder={t('chat.searchUsers')}
        unavailableLabel={t('chat.unsupportedRole')}
      />
    </>
  )
}
