# 에이전트 메모리 도구 검토 — Hindsight · Mem0 · Zep

> 조사 시점: 2026-07-11 · 대상: 6명+ 팀 실프로젝트용 에이전트 메모리 선정
> 참고: 별점/스타 수/가격은 조사 시점 기준이며 변동 가능(특히 Zep 가격은 유동적).

## 1. 배경과 목적

- **현재 프로젝트는 테스트용**, 본 프로젝트는 **6명 이상 팀**이 함께 작업.
- gstack의 `gbrain`을 검토하다가, gbrain이 **1인 운영 전용**이라 팀/멀티테넌트에는
  구조적으로 부적합하다는 결론에 도달 → 대안으로 지목된 3종을 검토.
- 주의: 이 3종은 **"에이전트 메모리"**(에이전트가 세션 간 기억하는 계층)로, gbrain이
  하던 코드/지식 검색과는 결이 다름. 6명 팀의 실질 니즈는 보통 **여러 멤버·에이전트가
  공유하는 결정·컨텍스트 기억 + 멀티테넌트 격리**임.

## 2. 후보 개요

| 도구 | 제공사 | 코어 라이선스 | 스타(조사 시점) | 핵심 성격 |
|---|---|---|---|---|
| **Hindsight** | Vectorize | **MIT** | ⭐18.2K (2025-12 출시) | 구조화 fact + 4-전략 검색, 멀티테넌트·자체호스트 지향 |
| **Mem0** | mem0ai (YC) | Apache 2.0 | ⭐58K | 최대 생태계, per-user 개인화, vector+graph 하이브리드 |
| **Zep** | Zep Inc. | Apache 2.0 (Graphiti만) | ⭐27K (Graphiti) | 시간형 지식그래프, 엔터프라이즈 컴플라이언스 |

## 3. 비교표

| 항목 | Hindsight | Zep (Graphiti) | Mem0 |
|---|---|---|---|
| 성숙도 | 가장 young, 개발 매우 활발(일 단위 커밋) | Graphiti 성숙 | 가장 큼, YC $24M |
| 아키텍처 | fact 추출 + 엔티티그래프 + **4전략**(semantic·BM25·graph·temporal) + cross-encoder 리랭크 | **시간형 지식그래프**(fact 유효기간 관리) | vector+graph+kv 하이브리드, LLM fact 추출 |
| **멀티테넌트/팀** | ⭐**최상** — bank 격리 + 조직별 OAuth 2.1 + per-client 발급/취소/감사 | 좋음 — governed "Context Lake"(접근제어·감사), 단 클라우드 | 약함 — **per-user 설계**, org 스코프는 있으나 팀 공유는 별도 아키텍처 필요 |
| **자체호스트** | ⭐**Docker 한 줄**(API+Postgres+임베딩+MCP 풀스택) | 나쁨 — CE deprecated, raw Graphiti+Neo4j 직접 운영 | 가능하나 "미들웨어" — LLM+벡터DB+Neo4j 직접 배선, Docker quickstart 없음 |
| 코딩에이전트 연동 | ⭐Claude Code·Codex **UserPromptSubmit 훅**으로 recall 자동 주입 | MCP 서버(Claude/Cursor) | OpenClaw·Cursor 플러그인, OpenMemory MCP |
| 시간추론 | 있음(temporal 검색) | ⭐**최상**(bi-temporal, "언제 참이었나") | 제한적 |
| 컴플라이언스 | 감사로그·테넌트 인증 | ⭐SOC2 Type2+HIPAA+GDPR (RFP 강함) | SOC2+HIPAA(관리형/엔터프라이즈) |
| latency | 4전략 병렬+리랭크 | <200ms(p95) | ⭐최속(p50 148ms) |
| SDK | Python·TypeScript | Python·TS·Go | Python·JS(update/delete 갭 있음) |

## 4. 도구별 상세

### Hindsight (Vectorize)
- **강점**: 멀티테넌트가 1급(bank + 멤버별 OAuth), Docker 한 줄 자체호스트,
  Claude Code/Codex 훅으로 recall 자동 주입, 4전략+cross-encoder로 정확도 강조,
  MIT 풀스택 개방.
- **약점**: 셋 중 가장 어리고 커뮤니티 작음, **단일 벤더(Vectorize) 주도**,
  관리형(Cloud) 유료 티어 문서 적음.
- **주의**: Hindsight를 극찬하는 상세 리뷰 다수가 **vectorize.io(자사 사이트)** →
  "나머지는 Hindsight" 류 결론은 마케팅으로 간주하고 걸러볼 것.

### Mem0 (mem0ai)
- **강점**: 최대 생태계(⭐58K), YC $24M, AWS Agent SDK 메모리 공급자,
  최속 latency, 프로토타이핑 쉬움, Apache 2.0 자체호스트 무료.
- **약점**: **per-user 개인화 설계** — 팀 공유 메모리엔 구조적으로 약함.
  그래프 검색이 **$249/월 Pro 페이월**. 자체호스트는 Neo4j 등 직접 운영(미들웨어).
  JS SDK가 update/delete 미지원(자체호스트 시 REST 직접 호출).
- **가격**: 자체호스트 무료 / 관리형 Hobby 무료·Starter $19·Growth $79·Pro $249·Enterprise.

### Zep (Graphiti)
- **강점**: 시간추론 최상(결정 이력·감사추적), 엔터프라이즈 컴플라이언스(RFP 통과용),
  모든 티어에서 전 기능(그래프 게이팅 없음), Go SDK 포함.
- **약점**: **Zep CE deprecated** → 자체호스트는 raw Graphiti + Neo4j/FalkorDB 직접 운영.
  가격 상향 이동(무료→Flex 약 $1,250/년~, 일부 소스 $99/월 — **유동적**).
  credit 과금(350바이트=1credit)으로 문서 대량 처리 시 비용 스파이크. 학습곡선 가파름.
- **가격**: Graphiti 자체호스트 무료 / Zep Cloud 유료(연 단위 상향).

## 5. 오픈소스 / 자체호스트 개방도

| 도구 | 오픈소스 코어 | 라이선스 | 개방도 |
|---|---|---|---|
| **Hindsight** | ✅ 전체 | **MIT** | 풀스택 자체호스트 무료 — 가장 깔끔 |
| **Mem0** | ✅ 코어 | Apache 2.0 | 그래프·분석·대시보드는 관리형 유료 |
| **Zep** | ⚠️ 엔진만 | Apache 2.0 | Graphiti만 오픈, 플랫폼 기능은 클라우드 전용 |

세 도구 모두 **오픈코어**(코드 개방 + 관리형 유료). 단 **팀이 오픈소스로 자체호스트**하려면
개방도는 **Hindsight > Mem0 > Zep** 순.

## 6. 6명+ 팀 · 실프로젝트 · 코딩에이전트 기준 권장

| 우선순위 | 선택 | 근거 |
|---|---|---|
| 🥇 1순위 | **Hindsight** (자체호스트) | 멀티테넌트 1급 + Docker 한 줄 + 코딩에이전트 훅 삼박자. Loom 계열 워크플로에 최적 |
| 🥈 조건부 | **Zep Cloud** | "언제 무엇이 참이었나"(시간추론)가 핵심이거나 금융/의료급 컴플라이언스 RFP + 예산($1k+/년) OK |
| 🥉 대안 | **Mem0** (자체호스트) | 팀 공유보다 개발자 개인별 개인화 우선 + 최대 생태계/지원. 팀 공유는 직접 설계 |

**핵심 판단**: 6명 팀 + 자체호스트 선호 + 코딩에이전트 맥락에서는 **Hindsight가 가장
자연스러운 1순위**. 멤버별 OAuth 승인(공유 secret 없음)과 bank 격리가 팀 격리 요구에
정확히 맞고, 자체호스트가 가장 쉬움.

## 7. 주의사항 (결정 전 필수)

1. **벤더 편향**: Hindsight 호평 리뷰가 자사 사이트에 몰림 — 독립 검증 필요.
2. **미성숙**: Hindsight는 셋 중 가장 어리고 커뮤니티 작음. 단일 벤더 거버넌스.
3. **PoC 필수**: gbrain/GSD 검토 때처럼 공급망·안정성을 **직접** 검증한 뒤 도입.
4. **카테고리 재확인**: 우리가 진짜 필요한 게 (a) 공유 결정/컨텍스트 기억인지
   (b) 코드/지식 검색인지 (c) 개인별 개인화인지 명확히 할 것 — (b)라면 gbrain류가,
   (a)/멀티테넌트라면 이 3종이 맞음.

## 8. 다음 단계 제안

- **테스트 프로젝트에서 Hindsight PoC** (Docker 한 줄, 무료·자체호스트 → 리스크 낮음):
  Loom 워크플로에 MCP로 연결, bank 구조·멤버 OAuth 설계 검증.
- 필요 시 산출물:
  1. Hindsight PoC 셋업 가이드(Docker + Claude Code MCP 연결 + bank 설계)
  2. 팀 실제 니즈 가중치를 반영한 결정 매트릭스

## 9. 출처 (조사 시점 2026-07-11)

- Hindsight: github.com/vectorize-io/hindsight (MIT, v0.8.4), hindsight.vectorize.io,
  arXiv 2512.12818
- Mem0: github.com/mem0ai/mem0 (Apache 2.0), rywalker.com·doolpa·knowledgeplane 리뷰
- Zep/Graphiti: getzep.com, github.com/getzep/graphiti, rywalker.com·weavai 리뷰
- 비교: vectorize.io 기사(mem0-vs-zep, hindsight-vs-zep, gbrain-vs-hindsight) —
  **Vectorize 자사 매체이므로 편향 감안**
