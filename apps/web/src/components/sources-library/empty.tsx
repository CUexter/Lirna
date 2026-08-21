import { buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Link } from "@tanstack/react-router";

export function EmptyLibrary() {
  return (
    <Card className="mb-4 border-dashed">
      <CardHeader>
        <CardTitle className="font-serif text-2xl">No Sources yet</CardTitle>
        <CardDescription>
          Admit a publication to make it available in your reading library.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/sources/admission"
        >
          Add your first Source
        </Link>
      </CardFooter>
    </Card>
  );
}
