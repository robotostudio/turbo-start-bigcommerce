import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <p className="select-none text-[10rem] leading-none text-foreground md:text-[14rem] lg:text-[24rem]">
        404
      </p>
      <div className="flex flex-col items-center gap-4">
        <h1 className="font-light text-3xl tracking-tight md:text-4xl">
          This page doesn&apos;t exist
        </h1>
        <p className="text-muted-foreground text-sm tracking-wide">
          The page you were looking for could not be found.
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild className="uppercase tracking-wider" size="lg">
            <Link href="/collections">Back to Shop</Link>
          </Button>
          <Button
            asChild
            className="uppercase tracking-wider"
            size="lg"
            variant="secondary"
          >
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
