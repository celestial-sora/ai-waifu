import { redirect } from "next/navigation";
import { getAuthAccess } from "@/lib/auth/server";
import { getAuthConfiguration } from "@/lib/auth/config";
import LoginCard from "./login-card";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps): Promise<React.JSX.Element> {
  const [{ user }, params] = await Promise.all([getAuthAccess(), searchParams]);
  if (user) redirect("/");
  const error = typeof params.error === "string" ? params.error : undefined;
  return <LoginCard configuration={getAuthConfiguration()} error={error} />;
}
