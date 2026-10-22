import { SNInput } from '../sn_input/sn_input';
import { SNField } from './sn_field';

export function SNFieldGallery() {
  return (
    <section aria-labelledby="gallery-sn-field" className="max-w-sm space-y-4">
      <h2 id="gallery-sn-field" className="text-lg font-semibold text-text">
        SNField
      </h2>
      <SNField label="Default">
        <SNInput placeholder="Placeholder" />
      </SNField>
      <SNField label="With helper" hint="One line of help under the field">
        <SNInput />
      </SNField>
      <SNField label="With error" error="Something is not right" hint="Hidden while the error shows">
        <SNInput defaultValue="bad value" />
      </SNField>
      <SNField label="Password" trailing={<a href="#forgot" className="text-[13px] text-text-brand">Forgot?</a>}>
        <SNInput type="password" />
      </SNField>
      <SNField label="Disabled">
        <SNInput disabled defaultValue="Locked" />
      </SNField>
    </section>
  );
}
