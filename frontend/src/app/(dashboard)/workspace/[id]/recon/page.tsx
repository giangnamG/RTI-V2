import { redirect } from 'next/navigation'

export default function ReconPage({ params }: { params: { id: string } }) {
  redirect(`/workspace/${params.id}/recon/subdomains`)
}
