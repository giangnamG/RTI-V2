import { redirect } from 'next/navigation'

export default function WorkspacePage({ params }: { params: { id: string } }) {
  redirect(`/workspace/${params.id}/targets`)
}
