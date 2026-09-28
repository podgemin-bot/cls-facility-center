import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { NavMenu } from "@/components/nav-menu";
import { NavigationSheet } from "@/components/navigation-sheet";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth-session";
import prisma from "@/lib/prisma";
import LogoutButton from "./logout-button";

const Navbar = async () => {
  const session = await getCurrentSession();

  let isAdmin = false;
  if (session?.user?.id) {
    const user = await prisma.user
      .findUnique({ where: { id: session.user.id }, select: { role: true } })
      .catch(() => null);
    isAdmin = user?.role === "ADMIN";
  }

  return (
    <header className="sticky top-0 z-40 h-16 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-(--breakpoint-xl) items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <NavMenu className="hidden xl:block" isAdmin={isAdmin} isLoggedIn={!!session} />

        <div className="flex shrink-0 items-center gap-3">
          {!session && (
            <Button asChild>
              <Link href="/login">เข้าสู่ระบบ</Link>
            </Button>
          )}

          {session && (
            <>
              <div className="mr-2 hidden max-w-48 items-center truncate whitespace-nowrap sm:flex">
                สวัสดี, {session.user.name}
              </div>
              <LogoutButton />
            </>
          )}

          <div className="xl:hidden">
            <NavigationSheet isAdmin={isAdmin} isLoggedIn={!!session} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
