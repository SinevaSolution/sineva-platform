import { SNErrorState } from './sn_error_state';

export function SNErrorStateGallery() {
  return (
    <section aria-labelledby="gallery-sn-error-state" className="space-y-8">
      <h2 id="gallery-sn-error-state" className="text-lg font-semibold text-text">
        SNErrorState
      </h2>
      <SNErrorState
        headingLevel={3}
        title="We could not load this"
        message="Something went wrong on our side. Try again in a moment."
        onRetry={() => {}}
        retryLabel="Try again"
      />
      <SNErrorState
        headingLevel={3}
        title="Sino is not answering"
        message="Sino isn't answering right now. Try again in a moment."
        onRetry={() => {}}
        retryLabel="Try again"
        requestId="req_01HZX3Y9K2"
        requestIdLabel="Request ID"
      />
      <SNErrorState
        headingLevel={3}
        title="No access"
        message="You don't have access to this yet. Ask an admin."
      />
    </section>
  );
}
