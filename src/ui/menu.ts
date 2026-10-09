import { Toaster } from './Toaster'

/** the site menu (the toaster), on every page */
export function mountMenu(opts: { grow?: boolean; drawn?: boolean; drawnToasts?: boolean | 'hover' | 'fade' | 'spread' | 'rise'; realisticToast?: boolean } = {}): Toaster {
  const base = import.meta.env.BASE_URL
  return new Toaster([
    { label: 'Home', href: base },
    { label: 'About', href: `${base}garage.html` },
    { label: 'Contact', href: null }, // not built yet
  ], { grow: opts.grow ?? true, drawn: opts.drawn, drawnToasts: opts.drawnToasts, realisticToast: opts.realisticToast })
}
