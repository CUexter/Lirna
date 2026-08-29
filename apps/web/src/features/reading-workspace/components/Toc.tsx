import type { ReadingDerivative } from "../article/components/Content";

export function Toc({ items }: { items: ReadingDerivative["toc"] }) {
  return (
    <ol className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.id}>
          <a
            className="text-muted-foreground underline-offset-4 hover:underline focus-visible:underline"
            href={`#${item.id}`}
          >
            {item.title}
          </a>
          {item.children.length ? (
            <div className="mt-1 ml-3 border-l pl-3">
              <Toc items={item.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
