import Link from "next/link";
import { CategoryBadge } from "@/components/places/category-icon";
import { Card, PageHeader, tableCls } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { listCategories } from "@/features/admin/queries";
import { CategoryToggle } from "./category-toggle";

export const metadata = { title: "Catégories" };

export default async function CategoriesAdmin() {
  await requirePermission("categories.manage", "/admin/categories");
  const groups = await listCategories();

  return (
    <>
      <PageHeader
        title="Catégories"
        description="Activez ou masquez une catégorie, et choisissez celles mises en avant sur l'accueil. Le nombre de lieux publiés inclut les sous-catégories."
      />
      <div className="grid gap-5 xl:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id}>
            <div className="border-line flex items-center gap-3 border-b px-5 py-4">
              <CategoryBadge icon={g.icon} color={g.color} size="md" />
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">{g.name}</h2>
                <p className="text-muted text-xs">
                  {g.count} lieu{g.count > 1 ? "x" : ""} · {g.children.length} sous-catégories
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-2">
                  Active{" "}
                  <CategoryToggle
                    id={g.id}
                    field="is_active"
                    value={g.is_active}
                    label={`${g.name} active`}
                  />
                </span>
                <span className="flex items-center gap-2">
                  En avant{" "}
                  <CategoryToggle
                    id={g.id}
                    field="is_featured"
                    value={g.is_featured}
                    label={`${g.name} mise en avant`}
                  />
                </span>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {g.children.map((c) => (
                  <tr key={c.id} className={tableCls.tr}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/admin/lieux?categorie=${c.slug}`}
                        className="hover:text-brand font-medium"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="text-muted px-3 py-2.5 text-right tabular-nums">{c.count}</td>
                    <td className="w-16 px-5 py-2.5 text-right">
                      <CategoryToggle
                        id={c.id}
                        field="is_active"
                        value={c.is_active}
                        label={`${c.name} active`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
