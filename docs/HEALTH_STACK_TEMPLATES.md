# Health Stack 템플릿 (Rust · Python)

`/health` 스킬은 프로젝트 `CLAUDE.md`의 `## Health Stack` 섹션을 읽어 거기 나열된
명령을 그대로 실행하고, 카테고리별로 0~10점을 매겨 가중 합산합니다. 이 문서는
Rust·Python 프로젝트에 복붙할 수 있는 템플릿입니다.

## 채점 카테고리와 가중치

`/health`가 인식·채점하는 카테고리 키는 **정해져 있습니다**. 아래 키만 씁니다.

| 키 | 가중치 | 의미 |
|---|---|---|
| `test` | 28% | 테스트 통과 |
| `typecheck` | 22% | 타입/컴파일 검사 |
| `lint` | 18% | 정적 분석(버그·스타일) |
| `deadcode` | 13% | 미사용 코드·의존성 |
| `shell` | 9% | 셸 스크립트 린트 |

- 도구가 없는 카테고리는 SKIP되고 가중치는 나머지에 비례 재분배됩니다.
- 채점은 **종료코드 + 출력 파싱**으로 합니다(exit 0 = 만점, 경고/에러 개수로 감점).
- `format`은 `/health` 채점 대상이 아니라서 아래 템플릿에 넣지 않았습니다. 필요하면
  별도 명령으로 돌리세요(각 언어 노트 참고).

---

## Rust 템플릿

`CLAUDE.md`에 붙여넣기:

```markdown
## Health Stack

- typecheck: cargo check --all-targets
- lint: cargo clippy --all-targets --all-features
- test: cargo test
- deadcode: cargo machete
- shell: shellcheck scripts/*.sh
```

### 사전 설치

| 도구 | 설치 | 비고 |
|---|---|---|
| `cargo check` / `clippy` / `test` / `fmt` | rustup 기본 포함 | clippy 없으면 `rustup component add clippy` |
| `cargo machete` | `cargo install cargo-machete` | 미사용 crate 의존성 탐지 |
| `shellcheck` | `brew install shellcheck` | 셸 스크립트 있을 때만 |

### 노트

- **타입 검사 = `cargo check`**: Rust는 컴파일러가 타입 게이트입니다. `cargo check`는
  코드 생성 없이 타입·소유권·미사용 import(`unused_imports`)·죽은 코드(`dead_code`)
  경고까지 냅니다. 즉 Rust는 타입체커가 lint/deadcode 일부를 겸합니다.
- **린트 = `cargo clippy`**: 컴파일러보다 깊은 관용구·성능·정확성 린트. CI에서 경고를
  실패로 만들려면 `-- -D warnings`를 붙이세요(단 `/health` 채점은 경고 개수로 감점하므로
  붙이지 않아도 신호는 잡힙니다).
- **죽은 코드 = 컴파일러 + `cargo machete`**: 파일 내 죽은 코드는 `cargo check`의
  `dead_code` 경고가, package(crate) 단위 미사용 의존성은 `cargo machete`가 담당.
  더 정밀한 미사용 의존성은 `cargo-udeps`(nightly 필요)도 있습니다.
- **포맷(선택)**: `cargo fmt --check` — `/health` 채점 밖. 커밋 훅/CI에서 별도 실행 권장.
- **보안(선택)**: `cargo audit`(`cargo install cargo-audit`) — 취약 의존성 스캔.

---

## Python 템플릿

`CLAUDE.md`에 붙여넣기:

```markdown
## Health Stack

- typecheck: mypy .
- lint: ruff check .
- test: pytest
- deadcode: vulture .
- shell: shellcheck scripts/*.sh
```

### 사전 설치

| 도구 | 설치 | 비고 |
|---|---|---|
| `ruff` | `pip install ruff` (또는 `uv add --dev ruff`) | 린트 + 포맷 통합 |
| `mypy` | `pip install mypy` | 정적 타입 검사 (또는 `pyright`) |
| `pytest` | `pip install pytest` | 테스트 러너 |
| `vulture` | `pip install vulture` | 죽은 코드 탐지 |
| `shellcheck` | `brew install shellcheck` | 셸 스크립트 있을 때만 |

### 노트

- **타입 검사 = `mypy` 또는 `pyright`**: Python은 동적 언어라 타입 검사기가 필수 별도
  도구입니다. `mypy`가 표준, `pyright`(`pip install pyright` / Node 기반)가 더 빠르고
  엄격. 타입 힌트가 거의 없는 코드베이스면 점수가 낮게 나오니 `mypy`의 엄격도를
  `pyproject.toml`에서 점진적으로 올리세요.
- **린트 = `ruff check`**: 2026년 표준. flake8·pylint·isort를 Rust 기반 단일
  바이너리로 대체. 미사용 import(F401)도 여기서 잡히므로 deadcode와 일부 겹칩니다.
- **죽은 코드 = `vulture`**: knip의 Python 대응. 미사용 함수·클래스·변수 탐지
  (신뢰도 기반). 미사용 **의존성**은 `deptry`(`pip install deptry`, 실행 `deptry .`)가
  package 단위로 잡습니다 — deadcode를 둘로 나누고 싶으면 별도 카테고리 대신 CI에 추가.
- **포맷(선택)**: `ruff format --check .` — `/health` 채점 밖.
- **보안(선택)**: `pip-audit` — 취약 의존성 스캔.

### pyright를 쓰는 변형

```markdown
## Health Stack

- typecheck: pyright
- lint: ruff check .
- test: pytest
- deadcode: vulture .
- shell: shellcheck scripts/*.sh
```

---

## 참고 — 언어 무관 확장 카테고리

`/health` 기본 채점 밖이지만 CI/커밋 훅에 흔히 함께 두는 것:

| 차원 | JS/TS | Rust | Python |
|---|---|---|---|
| 포맷 | `biome format` / prettier | `cargo fmt --check` | `ruff format --check` |
| 커버리지 | `bun test --coverage` | `cargo llvm-cov` | `pytest --cov` |
| 보안 감사 | `bun audit` | `cargo audit` | `pip-audit` |

## 참고 — 이 저장소(JS/TS)의 실제 Health Stack

`CLAUDE.md`의 `## Health Stack` 참조:

```markdown
- typecheck: bun run --filter '*' typecheck
- test: bun test
- lint: biome lint .
- deadcode: knip
- shell: shellcheck scripts/*.sh
```
