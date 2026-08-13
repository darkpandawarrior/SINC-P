import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** A Registrar reads this on an old desktop monitor: dense rows, a visible grid,
 *  no zebra-striping tricks that vanish under a dark OS theme. Wraps in its own
 *  scroll container so a wide compliance table never pushes the page sideways. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}

/** Rows arrive in sequence rather than all at once, which reads as the table loading
 *  rather than the page flashing. Pure CSS, and the reduced-motion block in globals.css
 *  collapses it to nothing for anyone who has asked for that. */
export function Tbody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('stagger', className)} {...props} />
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-fast hover:bg-accent-soft-bg/40',
        className,
      )}
      {...props}
    />
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-fg-muted', className)}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2 text-fg', className)} {...props} />
}
