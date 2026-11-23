import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { jsonLdScript } from "@/lib/seo/json-ld";
import { JsonLd } from "./JsonLd";

describe("JsonLd", () => {
  it("renders one ld+json script with the escaped JSON", () => {
    const data = { "@context": "https://schema.org", "@type": "FurnitureStore", name: "Atelier </script> Test" };
    const { container } = render(<JsonLd data={data} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].innerHTML).toBe(jsonLdScript(data));
    // No `<` survives, so a value can never close the script tag.
    expect(scripts[0].innerHTML).not.toContain("<");
    expect(JSON.parse(scripts[0].innerHTML)).toEqual(data);
  });

  it("renders nothing without data", () => {
    const { container } = render(<JsonLd data={null} />);
    expect(container.innerHTML).toBe("");
  });
});
