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

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border', className)} {...props} />
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
