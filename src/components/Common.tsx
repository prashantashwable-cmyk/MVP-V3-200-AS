import React from 'react';
import { motion } from 'motion/react';
import { Check, Flame } from 'lucide-react';

// Reusable Premium Card Component
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hoverEffect = false, ...props }) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-[rgba(184,135,61,0.15)] shadow-diffuse transition-all duration-300 ${
        hoverEffect ? 'hover:shadow-lg hover:border-[rgba(184,135,61,0.30)] hover:-translate-y-[2px]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

// Reusable Premium Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'emerald' | 'outline' | 'ghost' | 'danger';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyle = "px-5 py-3 rounded-xl font-medium tracking-wide transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none cursor-pointer text-sm font-sans";
  
  const variants = {
    primary: "bg-antiquegold text-white hover:bg-[#a37532] shadow-sm active:scale-[0.98]",
    secondary: "bg-alabaster text-charcoal border border-[rgba(184,135,61,0.2)] hover:bg-[#edeae2]",
    emerald: "bg-royalemerald text-white hover:bg-[#0b3c31] shadow-sm active:scale-[0.98]",
    outline: "border-2 border-antiquegold text-antiquegold hover:bg-[rgba(184,135,61,0.06)]",
    ghost: "text-warmgray hover:text-charcoal hover:bg-alabaster",
    danger: "bg-error text-white hover:bg-[#9d3131]"
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

// Reusable icon-over-label tile — shared by the Operating Surfaces grid
// and the mobile "All Screens" sheet so both stay visually consistent
// instead of maintaining two near-identical implementations.
interface IconTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  selected?: boolean;
  size?: 'sm' | 'md'; // 'sm' = All Screens sheet, 'md' = Operating Surfaces (default)
  className?: string;
}

export const IconTile: React.FC<IconTileProps> = ({
  icon: Icon, label, onClick, selected = false, size = 'md', className = ''
}) => {
  const isSm = size === 'sm';
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center cursor-pointer transition-all group ${
        selected ? 'bg-[#0E4B3D]/10' : 'hover:bg-[rgba(184,135,61,0.08)]'
      } ${className}`}
    >
      {isSm ? (
        <Icon className={`w-5 h-5 shrink-0 ${selected ? 'text-royalemerald' : 'text-warmgray'}`} />
      ) : (
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          selected ? 'bg-royalemerald/10' : 'bg-[rgba(184,135,61,0.10)] group-hover:bg-[rgba(184,135,61,0.16)]'
        }`}>
          <Icon className={`w-5 h-5 ${selected ? 'text-royalemerald' : 'text-[#B8873D]'}`} />
        </div>
      )}
      <span className={`leading-tight line-clamp-2 text-charcoal ${isSm ? 'text-[10px] font-bold' : 'text-[11px] font-medium'}`}>
        {label}
      </span>
    </button>
  );
};

// Reusable Design System Status Badge
interface BadgeProps {
  status: 'active' | 'pending' | 'inactive' | 'completed' | 'in_progress' | 'qc_pending' | 'paid' | 'unpaid' | 'quoted' | 'captured' | 'closed' | 'closed_won';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  const styles: Record<string, string> = {
    active: "bg-[rgba(47,143,91,0.1)] text-success border border-[rgba(47,143,91,0.2)]",
    completed: "bg-[rgba(47,143,91,0.1)] text-success border border-[rgba(47,143,91,0.2)]",
    paid: "bg-[rgba(47,143,91,0.1)] text-success border border-[rgba(47,143,91,0.2)]",
    closed_won: "bg-[rgba(47,143,91,0.1)] text-success border border-[rgba(47,143,91,0.2)]",
    
    pending: "bg-[rgba(201,124,31,0.1)] text-warning border border-[rgba(201,124,31,0.2)]",
    in_progress: "bg-[rgba(201,124,31,0.1)] text-warning border border-[rgba(201,124,31,0.2)]",
    qc_pending: "bg-[rgba(184,135,61,0.1)] text-antiquegold border border-[rgba(184,135,61,0.2)]",
    quoted: "bg-[rgba(184,135,61,0.1)] text-antiquegold border border-[rgba(184,135,61,0.2)]",
    
    inactive: "bg-gray-100 text-gray-500 border border-gray-200",
    unpaid: "bg-[rgba(178,59,59,0.1)] text-error border border-[rgba(178,59,59,0.2)]",
    captured: "bg-royalemerald/10 text-royalemerald border border-royalemerald/20",
    closed: "bg-royalemerald/10 text-royalemerald border border-royalemerald/20",
  };

  const labels: Record<string, string> = {
    active: 'Active',
    completed: 'Completed',
    paid: 'Paid',
    closed_won: 'Closed Won',
    pending: 'Pending',
    in_progress: 'In Progress',
    qc_pending: 'QC Pending',
    quoted: 'Quoted',
    inactive: 'Inactive',
    unpaid: 'Unpaid',
    captured: 'Captured',
    closed: 'Closed'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wider ${styles[status] || styles.inactive} ${className}`}>
      {labels[status] || status}
    </span>
  );
};

// SIGNATURE ELEMENT: The Ascension Line
// A vertical/horizontal golden progress line mimicking an elevator's vertical floor indicators.
interface Step {
  id: string;
  label: string;
  completed: boolean;
  active?: boolean;
}

interface AscensionLineProps {
  steps: Step[];
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export const AscensionLine: React.FC<AscensionLineProps> = ({
  steps,
  orientation = 'vertical',
  className = ''
}) => {
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex ${isVertical ? 'flex-col' : 'flex-row items-center justify-between'} gap-6 relative ${className}`}>
      {/* Background Line */}
      <div 
        className={`absolute bg-[#e5dfd4] rounded-full ${
          isVertical 
            ? 'left-[14px] top-4 bottom-4 w-[2px]' 
            : 'left-6 right-6 top-[14px] h-[2px]'
        }`} 
      />

      {/* Progress Fill */}
      {(() => {
        const total = steps.length;
        const completedCount = steps.filter(s => s.completed).length;
        const percent = total > 1 ? (completedCount / (total - 1)) * 100 : 0;
        
        return (
          <div 
            className={`absolute bg-antiquegold rounded-full transition-all duration-700 ${
              isVertical 
                ? 'left-[14px] top-4 w-[2px]' 
                : 'left-6 top-[14px] h-[2px]'
            }`}
            style={{
              height: isVertical ? `calc(${percent}% - 16px)` : undefined,
              width: !isVertical ? `calc(${percent}% - 32px)` : undefined,
            }}
          />
        );
      })()}

      {/* Nodes */}
      {steps.map((step, idx) => {
        const isCompleted = step.completed;
        const isActive = step.active || (!isCompleted && steps.findIndex(s => !s.completed) === idx);

        return (
          <div 
            key={step.id} 
            className={`flex ${isVertical ? 'flex-row items-start' : 'flex-col items-center'} gap-4 relative z-10`}
          >
            {/* Step indicator node */}
            <div className="relative">
              <motion.div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all duration-300 ${
                  isCompleted 
                    ? 'bg-antiquegold border-antiquegold text-white shadow-[0_0_12px_rgba(184,135,61,0.4)]' 
                    : isActive 
                      ? 'bg-white border-antiquegold text-antiquegold shadow-[0_0_8px_rgba(184,135,61,0.2)]'
                      : 'bg-white border-[#e0dacd] text-warmgray'
                }`}
                animate={isCompleted ? { scale: [1, 1.12, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </motion.div>
              
              {/* Subtle pulsing indicator for current active step */}
              {isActive && (
                <span className="absolute -inset-1 rounded-full border border-antiquegold/40 animate-ping opacity-75" />
              )}
            </div>

            {/* Label */}
            <div className={`${isVertical ? 'pt-0.5' : 'text-center'}`}>
              <p className={`text-xs font-semibold ${
                isActive ? 'text-charcoal' : isCompleted ? 'text-[#877e74]' : 'text-warmgray'
              }`}>
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
