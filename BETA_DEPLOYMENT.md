# PCRS 배포

## 1. GitHub 자동 배포

이 프로젝트는 `main` 단일 브랜치로 운영한다. GitHub 원격 저장소의 `main`에 커밋을 푸시하면 다음 배포가 자동으로 시작된다.

1. **Vercel**: `frontend`를 빌드해 Production 배포한다. Vercel의 **Settings → Git → Production Branch**가 `main`인지 확인한다.
2. **Render**: `render.yaml`의 `autoDeploy: true`에 따라 API를 자동 배포한다. Render 서비스가 같은 저장소의 `main` 브랜치를 추적해야 한다.

배포가 실패하면 각 서비스의 Deployments 로그에서 빌드 오류와 환경 변수를 먼저 확인한다.

## 2. Supabase 계정 제한

공개 배포 URL만으로는 Supabase anon 키를 통한 신규 가입을 완전히 막지 못한다. 제한된 테스트 운영이 필요할 때만 다음을 적용한다.

1. Supabase Dashboard에서 **Authentication → Providers → Email**의 신규 가입을 비활성화한다.
2. **Authentication → Users**에서 베타 테스터 이메일만 초대 또는 생성한다.
3. **Authentication → URL Configuration**에 Vercel Production URL의 `/app` 경로를 Redirect URL로 추가한다.
4. Google 로그인도 사용할 경우 Google OAuth 허용 Redirect URI에 같은 URL을 추가한다.

## 3. Render API

Render에서 저장소를 연결한 뒤 루트의 `render.yaml`로 Blueprint를 생성한다. 다음 값은 Render Dashboard에서 직접 입력한다.

```text
SUPABASE_URL=<Supabase project URL>
SUPABASE_KEY=<server Supabase key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
CORS_ALLOW_ORIGINS=<Vercel Production origin, e.g. https://your-project.vercel.app>
```

`SUPABASE_SERVICE_ROLE_KEY`는 Vercel, GitHub, 프런트 환경 변수에 넣지 않는다.

## 4. Vercel 프런트

Vercel 프로젝트의 Root Directory를 `frontend`로 설정하고, Production 환경 변수에 다음을 입력한다.

```text
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
NEXT_PUBLIC_API_BASE_URL=<Render API URL>
```

`NEXT_PUBLIC_*` 값은 브라우저 번들에 포함된다. anon 키는 공개 키이므로 허용되지만 service role 키는 절대 사용하지 않는다.

## 5. 배포 순서와 점검

1. Render API를 배포하고 `/health`가 200인지 확인한다.
2. Vercel Production 환경 변수를 입력하고 Production URL을 확인한다.
3. Render의 `CORS_ALLOW_ORIGINS`를 실제 Vercel Production origin으로 설정한 뒤 재배포한다.
4. Supabase Redirect URL을 Production URL의 `/app` 경로로 추가한다.
5. `main`에 푸시한 뒤 Vercel과 Render의 배포 성공 상태를 모두 확인한다.
6. Production URL에서 로그인, 옷장 등록·수정, 추천, 비밀번호 재설정을 확인한다.
