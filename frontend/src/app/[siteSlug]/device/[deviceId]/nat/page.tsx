import { redirect } from "next/navigation";

export default async function NatIndex({
  params,
}: {
  params: Promise<{ siteSlug: string; deviceId: string }>;
}) {
  const { siteSlug, deviceId } = await params;
  redirect(`/${siteSlug}/device/${deviceId}/nat/nat44`);
}
