import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.svg"
          alt="Mealio"
          className="size-16 rounded-2xl shadow-lg shadow-primary/20"
        />
        <h1 className="text-2xl font-bold tracking-tight">Mealio</h1>
        <p className="text-muted-foreground text-sm">
          Snap it. Track it. Trust the trend.
        </p>
      </div>
      <SignIn />
    </div>
  );
}
