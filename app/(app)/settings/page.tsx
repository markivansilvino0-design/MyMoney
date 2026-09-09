import { createClient } from "@/lib/supabase/server";
import {
  createCategory,
  createOwner,
  deleteCategory,
  deleteOwner,
  renameCategory,
  renameOwner,
  setDefaultOwner,
  toggleCategory,
  toggleOwner,
} from "./actions";

type CategoryRow = {
  id: string;
  name: string;
  category_type: "income" | "expense";
  is_active: boolean;
};

type OwnerRow = {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

function CategoryItem({ category }: { category: CategoryRow }) {
  return (
    <div className={`setting-item ${category.is_active ? "" : "setting-item-muted"}`}>
      <div className="setting-item-main">
        <form action={renameCategory} className="setting-inline-edit category-inline-edit">
          <input type="hidden" name="id" value={category.id} />
          <input name="name" defaultValue={category.name} maxLength={80} aria-label={`Rename ${category.name}`} required />
          <select name="category_type" defaultValue={category.category_type} aria-label={`Type for ${category.name}`}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button className="secondary-btn small-btn" type="submit">Save</button>
        </form>
        <div className="setting-meta">
          <span className={`type-badge type-${category.category_type}`}>{category.category_type}</span>
          <span className={`status-badge ${category.is_active ? "status-active" : "status-muted"}`}>{category.is_active ? "Active" : "Inactive"}</span>
        </div>
      </div>
      <div className="setting-row-actions">
        <form action={toggleCategory}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="next_active" value={category.is_active ? "false" : "true"} />
          <button className="secondary-btn small-btn" type="submit">{category.is_active ? "Deactivate" : "Reactivate"}</button>
        </form>
        <form action={deleteCategory}>
          <input type="hidden" name="id" value={category.id} />
          <button className="danger-btn small-btn" type="submit">Delete</button>
        </form>
      </div>
    </div>
  );
}

function OwnerItem({ owner }: { owner: OwnerRow }) {
  return (
    <div className={`setting-item ${owner.is_active ? "" : "setting-item-muted"}`}>
      <div className="setting-item-main">
        <form action={renameOwner} className="setting-inline-edit">
          <input type="hidden" name="id" value={owner.id} />
          <input name="name" defaultValue={owner.name} maxLength={80} aria-label={`Rename ${owner.name}`} required />
          <button className="secondary-btn small-btn" type="submit">Save</button>
        </form>
        <div className="setting-meta">
          {owner.is_default && <span className="status-badge status-warning">Default</span>}
          <span className={`status-badge ${owner.is_active ? "status-active" : "status-muted"}`}>{owner.is_active ? "Active" : "Inactive"}</span>
        </div>
      </div>
      <div className="setting-row-actions">
        {!owner.is_default && (
          <form action={setDefaultOwner}>
            <input type="hidden" name="id" value={owner.id} />
            <button className="secondary-btn small-btn" type="submit">Make default</button>
          </form>
        )}
        <form action={toggleOwner}>
          <input type="hidden" name="id" value={owner.id} />
          <input type="hidden" name="next_active" value={owner.is_active ? "false" : "true"} />
          <button className="secondary-btn small-btn" type="submit" disabled={owner.is_default && owner.is_active}>{owner.is_active ? "Deactivate" : "Reactivate"}</button>
        </form>
        <form action={deleteOwner}>
          <input type="hidden" name="id" value={owner.id} />
          <button className="danger-btn small-btn" type="submit" disabled={owner.is_default}>Delete</button>
        </form>
      </div>
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const notices = await searchParams;
  const supabase = await createClient();
  const [{ data: categories }, { data: owners }] = await Promise.all([
    supabase.from("categories").select("id,name,category_type,is_active").order("category_type").order("is_active", { ascending: false }).order("name"),
    supabase.from("owners").select("id,name,is_default,is_active").order("is_default", { ascending: false }).order("is_active", { ascending: false }).order("name"),
  ]);

  const categoryRows = (categories ?? []) as CategoryRow[];
  const ownerRows = (owners ?? []) as OwnerRow[];
  const income = categoryRows.filter((row) => row.category_type === "income");
  const expense = categoryRows.filter((row) => row.category_type === "expense");
  const activeCategories = categoryRows.filter((row) => row.is_active).length;
  const activeOwners = ownerRows.filter((row) => row.is_active).length;

  return (
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">Customize</div><h2>Settings</h2><p>Edit the categories and Owner / Charge to choices used throughout MyMoney.</p></div>
      </div>

      {notices.error && <div className="notice error page-notice">{notices.error}</div>}
      {notices.success && <div className="notice success page-notice">{notices.success}</div>}

      <section className="cards settings-stats">
        <div className="stat-card"><div className="stat-label">Active categories</div><div className="stat-value">{activeCategories}</div><div className="stat-foot">Income + expense choices</div></div>
        <div className="stat-card"><div className="stat-label">Income categories</div><div className="stat-value positive">{income.filter((row) => row.is_active).length}</div><div className="stat-foot">Used for money received</div></div>
        <div className="stat-card"><div className="stat-label">Expense categories</div><div className="stat-value negative">{expense.filter((row) => row.is_active).length}</div><div className="stat-foot">Used for spending and budgets</div></div>
        <div className="stat-card"><div className="stat-label">Active owners</div><div className="stat-value">{activeOwners}</div><div className="stat-foot">Owner / Charge to choices</div></div>
      </section>

      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="section-heading"><div><h3>Categories</h3><p className="muted">Add your own categories, rename them, or deactivate choices you no longer use.</p></div></div>
          <form action={createCategory} className="settings-add-form">
            <div className="field"><label htmlFor="category-name">Category name</label><input id="category-name" name="name" placeholder="e.g. Groceries" maxLength={80} required /></div>
            <div className="field"><label htmlFor="category-type">Type</label><select id="category-type" name="category_type" defaultValue="expense"><option value="expense">Expense</option><option value="income">Income</option></select></div>
            <button className="primary-btn" type="submit">+ Add category</button>
          </form>

          <div className="settings-group">
            <div className="settings-group-title"><strong>Expense</strong><span>{expense.length}</span></div>
            <div className="settings-list">{expense.length ? expense.map((category) => <CategoryItem key={category.id} category={category} />) : <div className="compact-empty empty">No expense categories.</div>}</div>
          </div>
          <div className="settings-group">
            <div className="settings-group-title"><strong>Income</strong><span>{income.length}</span></div>
            <div className="settings-list">{income.length ? income.map((category) => <CategoryItem key={category.id} category={category} />) : <div className="compact-empty empty">No income categories.</div>}</div>
          </div>
          <div className="settings-help">Deactivate is safest for a category already used in transactions. Delete is allowed only when the category has no linked financial records.</div>
        </section>

        <section className="panel settings-panel">
          <div className="section-heading"><div><h3>Owner / Charge to</h3><p className="muted">Use owners to separate your spending from purchases made for family or other people.</p></div></div>
          <form action={createOwner} className="settings-add-form owner-add-form">
            <div className="field"><label htmlFor="owner-name">Owner name</label><input id="owner-name" name="name" placeholder="e.g. Mom, Family, Work" maxLength={80} required /></div>
            <button className="primary-btn" type="submit">+ Add owner</button>
          </form>
          <div className="settings-group">
            <div className="settings-group-title"><strong>Your owners</strong><span>{ownerRows.length}</span></div>
            <div className="settings-list">{ownerRows.length ? ownerRows.map((owner) => <OwnerItem key={owner.id} owner={owner} />) : <div className="compact-empty empty">No owners yet.</div>}</div>
          </div>
          <div className="settings-help">The default owner is preselected when you record a transaction. Set another default before deactivating or deleting the current default.</div>
        </section>
      </div>
    </main>
  );
}
