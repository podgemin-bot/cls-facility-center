import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth-session";
import LoginForm from "./login-form";

export const instant = false;

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session?.user?.id) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
