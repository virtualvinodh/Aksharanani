import React, { useEffect, useState } from 'react';

interface NotificationProps {
  message: string;
  onClose: () => void;
  duration?: number;
  type?: 'success' | 'info' | 'error';
}

const Notification: React.FC<NotificationProps> = ({ message, onClose, duration = 3000, type = 'success' }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Timer to trigger the exit animation
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration);

    // Timer to call onClose after the animation completes
    const closeTimer = setTimeout(() => {
        onClose();
    }, duration + 500); // 500ms is the transition duration

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  const colorClasses = {
    success: 'bg-green-600 text-white dark:bg-green-500 dark:text-gray-900',
    info: 'bg-blue-600 text-white dark:bg-blue-500',
    error: 'bg-red-600 text-white dark:bg-red-500'
  };

  return (
    <div
      className={`fixed bottom-10 left-1/2 -translate-x-1/2 transform transition-all duration-500 ease-in-out z-[100]
                  ${isExiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}
      role="alert"
    >
      <div className={`${colorClasses[type]} font-semibold px-6 py-3 rounded-lg shadow-xl`}>
        {message}
      </div>
    </div>
  );
};
export default React.memo(Notification);