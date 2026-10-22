import { SNFormSection } from './sn_form_section';

export function SNFormSectionGallery() {
  return (
    <section aria-labelledby="gallery-sn-form-section" className="max-w-xl space-y-4">
      <h2 id="gallery-sn-form-section" className="text-lg font-semibold text-text">
        SNFormSection
      </h2>
      <SNFormSection title="Plain" description="A description under the title">
        <p className="text-sm text-text-secondary">Fields go here.</p>
      </SNFormSection>
      <SNFormSection title="Divided" divided>
        <p className="py-4 text-sm text-text-secondary">Row one</p>
        <p className="py-4 text-sm text-text-secondary">Row two</p>
      </SNFormSection>
    </section>
  );
}
