import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const cookieStore = await cookies();
  const hasSession =
    cookieStore.has("archguard_access_token") || cookieStore.has("archguard_refresh_token");

  redirect(hasSession ? "/dashboard" : "/login");
}
