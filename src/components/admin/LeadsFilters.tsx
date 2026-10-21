import { Toolbar } from "@/components/admin/ui";
import { Button } from "@/components/site/Button";
import { Field, Input, Label, Select } from "@/components/site/form";
import {
  hasLeadFilters,
  LEAD_FILTER_KEYS,
  LEAD_FILTER_KINDS,
  LEAD_PERIOD_LABELS,
  LEAD_PERIODS,
  SEARCH_MAX,
  type LeadFilters,
} from "@/lib/admin/leads";
import { LEAD_KIND_LABELS, LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/admin/types";

/** The list this form filters. */
export const LEADS_PATH = "/admin/cereri";

export interface LeadsFiltersProps {
  /** The filters in the current URL; the controls start from them. */
  filters: LeadFilters;
}

// PLAN PR-7 „Cereri”: tip / status / perioadă and the search, as a GET form that
// reloads the list with its parameters in the URL. A Server Component with no
// JavaScript: the ids are static, the page has one such form. Controls from DESIGN
// §3.16, laid out by the admin Toolbar (§4.8).
export function LeadsFilters({ filters }: LeadsFiltersProps) {
  return (
    <form method="get" action={LEADS_PATH} aria-label="Filtre">
      <Toolbar>
        <Field className="flex-[1_1_160px]">
          <Label htmlFor="filter-tip">Tip</Label>
          <Select id="filter-tip" name={LEAD_FILTER_KEYS.kind} defaultValue={filters.kind ?? ""}>
            <option value="">toate</option>
            {LEAD_FILTER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {LEAD_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        <Field className="flex-[1_1_160px]">
          <Label htmlFor="filter-status">Status</Label>
          <Select id="filter-status" name={LEAD_FILTER_KEYS.status} defaultValue={filters.status ?? ""}>
            <option value="">toate</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field className="flex-[1_1_160px]">
          <Label htmlFor="filter-perioada">Perioadă</Label>
          <Select id="filter-perioada" name={LEAD_FILTER_KEYS.period} defaultValue={filters.period}>
            {LEAD_PERIODS.map((period) => (
              <option key={period} value={period}>
                {LEAD_PERIOD_LABELS[period]}
              </option>
            ))}
          </Select>
        </Field>

        <Field className="flex-[2_1_220px]">
          <Label htmlFor="filter-q">Căutare</Label>
          <Input
            id="filter-q"
            name={LEAD_FILTER_KEYS.q}
            type="search"
            defaultValue={filters.q}
            placeholder="nume, email, telefon, cod"
            maxLength={SEARCH_MAX}
            autoComplete="off"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary">
            Filtrează
          </Button>
          {hasLeadFilters(filters) && (
            <Button href={LEADS_PATH} variant="link">
              Șterge filtrele
            </Button>
          )}
        </div>
      </Toolbar>
    </form>
  );
}
