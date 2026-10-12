# 작업 규칙

## 브랜치와 병합

- 브랜치 이름: 코드가 바뀌면 `feat/`, 텍스트 파일만 바뀌면 `docs/` 접두어를 붙입니다.
- 작업 브랜치는 `dev`에서 만들고, `dev`로 PR을 올려 **Rebase and merge**로 병합합니다.
- `dev` → `main` PR은 사용자가 요청할 때만 올리고, 같은 방식으로 병합합니다.
- 병합된 브랜치는 GitHub 설정(Automatically delete head branches)으로 자동 삭제됩니다.
- `dev` → `main` 병합 후 `dev`가 삭제되면 `main`을 기준으로 `dev`를 다시 만듭니다.
