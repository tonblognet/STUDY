import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminNavigation } from "./admin-navigation";

describe("administrative navigation by role", () => {
  it("offers only support tools to support and only catalog tools to editors", () => {
    const support = renderToStaticMarkup(<AdminNavigation role="SUPPORT" />);
    expect(support).toContain('href="/admin/support"');
    for (const path of ["/admin/catalog", "/admin/billing", "/admin/users"])
      expect(support).not.toContain(`href="${path}"`);
    const editor = renderToStaticMarkup(
      <AdminNavigation role="CONTENT_MANAGER" />,
    );
    expect(editor).toContain('href="/admin/catalog"');
    for (const path of ["/admin/support", "/admin/billing", "/admin/users"])
      expect(editor).not.toContain(`href="${path}"`);
  });
  it("offers all staff areas to administrators and none to ordinary users", () => {
    for (const role of ["ADMIN", "SUPERADMIN"] as const) {
      const html = renderToStaticMarkup(<AdminNavigation role={role} />);
      for (const path of [
        "/admin/catalog",
        "/admin/support",
        "/admin/billing",
        "/admin/users",
      ])
        expect(html).toContain(`href="${path}"`);
    }
    expect(renderToStaticMarkup(<AdminNavigation role="USER" />)).toBe("");
  });
});
