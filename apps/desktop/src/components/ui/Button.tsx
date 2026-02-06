import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
    className,
    variant = 'primary',
    size = 'md',
    ...props
}, ref) => {
    return (
        <button
            ref={ref}
            className={twMerge(
                clsx(
                    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
                    {
                        // Variants
                        'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500': variant === 'primary',
                        'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 focus:ring-gray-200': variant === 'secondary',
                        'bg-transparent border border-gray-200 text-gray-700 hover:bg-gray-50': variant === 'outline',
                        'bg-transparent text-gray-700 hover:bg-gray-100': variant === 'ghost',

                        // Sizes
                        'px-3 py-1.5 text-sm': size === 'sm',
                        'px-4 py-2 text-sm': size === 'md',
                        'px-6 py-3 text-base': size === 'lg',
                    },
                    className
                )
            )}
            {...props}
        />
    );
});

Button.displayName = 'Button';
