'use server'

import { ZodError } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { isCsrfValid } from '@/lib/auth/csrf'
import { createAnnouncement, expireAnnouncement, publishAnnouncement, NEWS_CHANNELS, type NewsChannel } from '@/lib/news/service'
import { requireStaffActor } from '../_lib/actor'

function isNewsChannel(value: string): value is NewsChannel {
  return (NEWS_CHANNELS as readonly string[]).includes(value)
}

export async function createAnnouncementAction(formData: FormData): Promise<void> {
  const actor = await requireStaffActor('/news/new')
  if (!(await isCsrfValid(formData))) redirect('/news/new?error=csrf')

  const channel = String(formData.get('channel') ?? '')
  if (!isNewsChannel(channel)) redirect('/news/new?error=invalid')

  let slug: string
  try {
    const announcement = await createAnnouncement(actor, {
      title: String(formData.get('title') ?? ''),
      summary: String(formData.get('summary') ?? '') || undefined,
      body: String(formData.get('body') ?? ''),
      channel,
      isPinned: formData.get('isPinned') === 'on',
      publishNow: formData.get('publishNow') === 'on',
    })
    slug = announcement.slug
  } catch (err) {
    if (err instanceof ZodError) redirect('/news/new?error=invalid')
    throw err
  }

  revalidatePath('/news')
  redirect(`/news/${slug}`)
}

export async function publishAnnouncementAction(id: string, _formData: FormData): Promise<void> {
  const actor = await requireStaffActor('/news')
  await publishAnnouncement(actor, id)
  revalidatePath('/news')
}

export async function expireAnnouncementAction(id: string, _formData: FormData): Promise<void> {
  const actor = await requireStaffActor('/news')
  await expireAnnouncement(actor, id)
  revalidatePath('/news')
}
