import { IconBaseProps, IconType } from 'react-icons';
import useNotificationStore from '../store';

interface IconWithBadgeProps extends IconBaseProps {
  badgeCount?: number;
  badgeColor?: string;
  badgeSize?: number | string;
}

export const NotificationBadgeIcon: IconType = (props: IconWithBadgeProps) => {
  const {
    badgeColor = '#ef4444',    
    className = '',
    ...rest
  } = props;


  const wrapperProps = rest as React.HTMLAttributes<HTMLDivElement>;

  const unreadCount = useNotificationStore((s) => s.unreadCount)
  return (
    <div
      className={`relative ${className}`}
      
      {...wrapperProps}
    >      
      {unreadCount > 0 && (
        <span
          className=" flex justify-center px-1"
          style={{
            minWidth: 16,
            backgroundColor: badgeColor,
            top: 0,
            right: 0,
            color: '#ffffff',
            fontSize: '9px',
            padding: '2px',
            whiteSpace: 'nowrap',
            overflow: 'visible',
            borderRadius: '5px'
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
};

export default NotificationBadgeIcon