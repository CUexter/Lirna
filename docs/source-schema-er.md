# Source Schema ER Diagram

```mermaid
erDiagram
  sources ||--o{ source_states : contains
  sources ||--o{ source_relations : source
  sources ||--o{ source_relations : related
  sources ||--o{ sep_admission_previews : replaces

  sep_admission_previews ||--o{ sep_preview_resources : captures

  source_states ||--o{ source_state_resources : retains
  source_states ||--o{ source_state_derivatives : produces
  source_states ||--o{ source_state_derivative_activations : activates

  source_state_derivatives ||--o{ source_state_derivatives : predecessor
  source_state_derivatives ||--o{ source_state_derivative_activations : activated

  sources {
    uuid id PK
    text title
    text stable_key UK
    timestamptz admitted_at
  }

  source_states {
    uuid id PK
    uuid source_id FK
    int sequence
    text adapter_id
    text observation_key
    text canonical_url
    text rights_basis
    text sensitivity_level
    timestamptz admitted_at
  }

  source_relations {
    uuid source_id FK
    uuid related_source_id FK
    text kind
    timestamptz created_at
  }

  source_state_resources {
    uuid id PK
    uuid source_state_id FK
    text role
    text requested_url
    text final_url
    int status
    text media_type
    int byte_length
    text sha256
    bytea body
    timestamptz retrieved_at
  }

  source_state_derivatives {
    uuid id PK
    uuid source_state_id FK
    text kind
    uuid previous_derivative_id FK
    boolean valid
    jsonb payload
    jsonb validation
    timestamptz created_at
  }

  source_state_derivative_activations {
    uuid id PK
    uuid source_state_id FK
    uuid derivative_id FK
    text kind
    timestamptz activated_at
  }

  sep_admission_previews {
    uuid id PK
    text stable_key
    text submitted_url
    text recommended_archive_url
    text title
    jsonb authors
    jsonb publication_history
    jsonb diagnostics
    jsonb capture_diagnostics
    text rights_basis
    text sensitivity_level
    uuid replaces_source_id FK
    timestamptz created_at
    timestamptz expires_at
  }

  sep_preview_resources {
    uuid id PK
    uuid preview_id FK
    text observation_key
    text role
    text requested_url
    text final_url
    int status
    text media_type
    int byte_length
    text sha256
    bytea body
    timestamptz retrieved_at
  }
```

## Invariants

- Source states, retained resources, Derivatives, relations, and activation history are append-only.
- Derivative lineage stays within the same Source state and kind.
- Activations reference only valid Derivatives from the same Source state and kind.
- Preview resources are deleted with their admission preview.
- Retained resource bodies must match their declared byte length and SHA-256 hash.
