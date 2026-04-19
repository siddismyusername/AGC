"use client";

import { FormEvent, useEffect, useState } from 'react';

import RouteGuard from '../../components/route-guard';
import { getOrganization, OrganizationOut, updateOrganization } from '../../lib/api';

export default function OrganizationPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [organization, setOrganization] = useState<OrganizationOut | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    async function loadOrganization() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const org = await getOrganization();
        setOrganization(org);
        setName(org.name);
        setDescription(org.description ?? '');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load organization');
      } finally {
        setIsLoading(false);
      }
    }

    void loadOrganization();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const updated = await updateOrganization({
        name,
        description: description.trim() ? description : null,
      });
      setOrganization(updated);
      setSuccessMessage('Organization settings updated successfully.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update organization');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RouteGuard>
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-8 lg:px-10">
        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">Organization</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Settings</h1>
          <p className="mt-2 text-sm text-slate-300">
            Manage your organization profile and metadata used in governance reports.
          </p>

          {isLoading ? (
            <p className="mt-6 text-sm text-slate-300">Loading organization details...</p>
          ) : (
            <>
              {organization ? (
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Slug</p>
                    <p className="mt-2 text-lg text-white">{organization.slug}</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Members</p>
                    <p className="mt-2 text-lg text-white">{organization.members_count}</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Active projects</p>
                    <p className="mt-2 text-lg text-white">{organization.projects_count}</p>
                  </article>
                </div>
              ) : null}

              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Organization name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                    required
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-slate-300">Description</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none"
                    placeholder="Optional description"
                  />
                </label>

                {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
                {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

                <button
                  type="submit"
                  className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save changes'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </RouteGuard>
  );
}
