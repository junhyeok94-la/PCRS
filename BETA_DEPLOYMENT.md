# PCRS 베타 배포

## 1. 접근 제어

일반 배포 URL은 주소를 아는 사람이 접근할 수 있다. 무료 베타는 `beta` 브랜치를 Vercel Preview로 배포하고 **Deployment Protection + Shareable Link**를 사용한다.

1. `beta` 브랜치를 Vercel 프로젝트에 연결한다.
2. Vercel 프로젝트의 **Settings → Deployment Protection**에서 Vercel Authentication의 Standard Protection을 켠다.
3. 해당 Preview 배포의 Shareable Link를 생성해 초대자에게만 공유한다. 링크는 필요 시 폐기한다.
4. 실제 Production 도메인은 베타 종료 전까지 연결하지 않는다.

Vercel의 무료 Standard Protection은 Preview와 배포 URL을 보호하지만 Production 도메인은 보호하지 않는다. Production까지 비공개로 하려면 유료 Deployment Protection 또는 다른 접근 제어가 필요하다.

## 2. Supabase 계정 제한

배포 링크 보호만으로는 Supabase anon 키를 통한 신규 가입을 완전히 막지 못한다.

1. Supabase Dashboard에서 **Authentication → Providers → Email**의 신규 가입을 비활성화한다.
2. **Authentication → Users**에서 베타 테스터 이메일만 초대 또는 생성한다.
3. **Authentication → URL Configuration**에 Preview URL의 `/app` 경로를 Redirect URL로 추가한다.
4. Google 로그인도 사용할 경우 Google OAuth 허용 Redirect URI에 같은 URL을 추가한다.

## 3. Render API

Render에서 저장소를 연결한 뒤 루트의 `render.yaml`로 Blueprint를 생성한다. 다음 값은 Render Dashboard에서 직접 입력한다.

```text
SUPABASE_URL=<Supabase project URL>
SUPABASE_KEY=<server Supabase key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
CORS_ALLOW_ORIGINS=<Vercel Preview origin, e.g. https://pcrs-git-beta-<team>.vercel.app>
```

`SUPABASE_SERVICE_ROLE_KEY`는 Vercel, GitHub, 프런트 환경 변수에 넣지 않는다.

## 4. Vercel 프런트

Vercel 프로젝트의 Root Directory를 `frontend`로 설정하고, Preview 환경 변수에 다음을 입력한다.

```text
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
NEXT_PUBLIC_API_BASE_URL=<Render API URL>
```

`NEXT_PUBLIC_*` 값은 브라우저 번들에 포함된다. anon 키는 공개 키이므로 허용되지만 service role 키는 절대 사용하지 않는다.

## 5. 배포 순서와 점검

1. Render API를 배포하고 `/health`가 200인지 확인한다.
2. Vercel Preview 환경 변수를 입력하고 `beta` 브랜치를 배포한다.
3. Render의 `CORS_ALLOW_ORIGINS`를 실제 Preview origin으로 바꾼 뒤 재배포한다.
4. Supabase Redirect URL을 추가한다.
5. Shareable Link로 접속해 로그인, 옷장 등록·수정, 추천, 비밀번호 재설정을 확인한다.
