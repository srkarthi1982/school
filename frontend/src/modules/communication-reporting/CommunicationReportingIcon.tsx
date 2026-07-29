import { IconBaseProps, IconType } from 'react-icons';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import useNotificationStore from './notification/store';

interface ChatIconWithBadgeProps extends IconBaseProps {
  badgeCount?: number;
  badgeColor?: string;
  badgeSize?: number | string;
}

export const CommunicationReportingIcon: IconType = (props: ChatIconWithBadgeProps) => {
  const {
    badgeColor = '#ef4444',
    className = '',
    ...rest
  } = props;

  // Default to 1em so the icon scales with the container's font-size
  // (set via className, e.g. text-[22px]) — like every other react-icons icon.
  const size = props.size ?? '1em';
  const color = props.color ?? 'currentColor';

  const wrapperProps = rest as React.HTMLAttributes<HTMLDivElement>;

  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const badgeSize = unreadCount > 9 ? 18 : 15

  return (
    <div
      className={`relative inline-flex ${className}`}
      style={{ width: size, height: size }}
      {...wrapperProps}
    >
      <HiOutlineChatBubbleLeftRight size={size} color={color} />
      {unreadCount > 0 && (
        <span
          className="absolute rounded-full flex items-center justify-center pointer-events-none"
          style={{
            width: badgeSize,
            height: badgeSize,
            backgroundColor: badgeColor,
            top: 0,
            right: 0,
            transform: 'translate(50%, -50%)',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: 'bold',
            lineHeight: 1,
            padding: '1px',
            whiteSpace: 'nowrap',
            overflow: 'visible',
            display : 'flex',
            alignItems : 'center',
            justifyContent : 'center'
          }}
        >
          <span style={{marginTop:-2,marginLeft:unreadCount > 9 ? 0 : -1}}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        </span>
      )}
    </div>
  );
};

export default CommunicationReportingIcon