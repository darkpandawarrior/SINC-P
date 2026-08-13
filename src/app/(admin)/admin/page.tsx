import { redirect } from 'next/navigation'

// No dashboard to build for a four-page console — Users is the page an admin reaches
// for most often (inviting staff), so /admin lands there rather than on a landing page
// that would just be four links to the same nav the layout already renders.
export default function AdminIndexPage() {
  redirect('/admin/users')
}
