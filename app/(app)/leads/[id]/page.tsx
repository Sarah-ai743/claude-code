import { redirect } from "next/navigation";

// Lead details live in the Inbox conversation view (full lead info +
// message thread in one place), so this route just forwards there.
export default function LeadDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/inbox/${params.id}`);
}
