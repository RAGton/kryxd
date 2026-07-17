import React from 'react';
import { X, GripVertical } from 'lucide-react';
import KveCard from '../KveCard';
import { clsx } from 'clsx';

interface WidgetWrapperProps {
  id: string;
  title: string;
  isEditMode: boolean;
  onRemove: (id: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onMouseDown?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

const WidgetWrapper = React.forwardRef<HTMLDivElement, WidgetWrapperProps>(({ 
  id, 
  title, 
  isEditMode, 
  onRemove, 
  children,
  style,
  className,
  onMouseDown,
  onMouseUp,
  onTouchEnd
}, ref) => {
  return (
    <div 
      ref={ref}
      style={style}
      className={clsx(
        className,
        "group",
        isEditMode && "z-30"
      )}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onTouchEnd={onTouchEnd}
    >
      <div className={clsx(
        "h-full relative",
        isEditMode && "border-2 border-dashed border-kve-accent/30 rounded-2xl p-1 bg-kve-accent/5"
      )}>
        {isEditMode && (
          <div className="absolute -top-3 -right-3 z-50 flex gap-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
              className="p-1.5 rounded-full bg-kve-danger text-white shadow-lg hover:scale-110 transition-transform cursor-pointer"
            >
              <X size={12} />
            </button>
            <div className="p-1.5 rounded-full bg-kve-accent text-kve-bg shadow-lg cursor-grab active:cursor-grabbing drag-handle">
              <GripVertical size={12} />
            </div>
          </div>
        )}
        <KveCard title={title} className="h-full">
          {children}
        </KveCard>
      </div>
    </div>
  );
});

WidgetWrapper.displayName = 'WidgetWrapper';

export default WidgetWrapper;
