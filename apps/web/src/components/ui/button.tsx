'use client';

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "gradient-brand-btn text-white",
        destructive:
          "bg-red-600 text-white shadow-[0_8px_20px_-8px_rgba(220,38,38,0.6)] hover:-translate-y-0.5 hover:bg-red-700",
        outline:
          "border border-gray-200/90 bg-white/80 text-gray-700 shadow-sm backdrop-blur hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white hover:text-gray-900 hover:shadow-[0_10px_24px_-12px_rgba(0,168,120,0.45)]",
        secondary:
          "bg-gray-100 text-gray-800 hover:bg-gray-200/80",
        soft: "bg-brand-50 text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100/80 hover:-translate-y-0.5",
        ghost: "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerDown, children, ...props }, ref) => {
    const [ripples, setRipples] = React.useState<{ id: number; x: number; y: number }[]>([])
    const Comp = asChild ? Slot : "button"
    const dark = variant === "outline" || variant === "ghost" || variant === "secondary" || variant === "soft"

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(e)
      if (asChild) return
      const rect = e.currentTarget.getBoundingClientRect()
      const id = Date.now() + Math.random()
      setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }])
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 700)
    }

    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onPointerDown={handlePointerDown}
        {...props}
      >
        {children}
        {ripples.map((r) => (
          <span key={r.id} className={cn("btn-ripple", dark && "btn-ripple-dark")} style={{ left: r.x, top: r.y }} />
        ))}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
