// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";
import importPlugin from "eslint-plugin-import";

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  { ignores: [".next/", "scripts/", ".storybook/"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...storybook.configs["flat/recommended"],
  {
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: true,
        node: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "import/order": "off",
      // 기본 규칙 대신 TS 버전을 쓴다 — `import type { Dayjs } from "dayjs"` 같은
      // **타입 전용 import는 런타임 인스턴스를 끌어오지 않아** 막을 이유가 없는데,
      // 기본 no-restricted-imports는 그걸 구분하지 못한다(allowTypeImports가 없다).
      "no-restricted-imports": "off",
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message: "상대 경로 대신 @/ 별칭을 사용하세요.",
            },
          ],
          paths: [
            {
              name: "dayjs",
              message:
                'dayjs를 직접 import하지 마세요. `import { dayjs } from "@/lib/dayjs"` — KST 플러그인·로케일이 거기서 한 번만 설정됩니다(각자 extend하면 설정이 갈립니다).',
              allowTypeImports: true,
            },
          ],
        },
      ],
      // "오늘/지금"을 tz 없이 판정하는 것을 막는다.
      //
      // 왜 필요한가: 배포처(Vercel)는 UTC고 브라우저는 KST라, tz 없는 `dayjs()`로 날짜를
      // 다루면 KST 00:00~09:00 사이에 서버와 클라이언트가 **다른 "오늘"**을 본다. 날짜가
      // 하루 밀려 그려지고 하이드레이션도 그 지점에서 깨진다. 규칙을 문서로만 두면
      // (AGENTS.md·QUALITY-BAR에 이미 있었다) 사람이 읽고 판단해야 해서 계속 샜다 —
      // 실제로 이 룰을 넣기 전 17곳이 쌓여 있었다.
      //
      // **`dayjs()` 자체는 막지 않는다.** `dayjs().toISOString()`(절대시각 저장)과
      // `dayjs().tz(KST)...`는 정상이고 저장소에 73곳 있다. 막는 건 `dayjs()` **바로 뒤에**
      // 타임존에 휘둘리는 연산이 붙는 경우뿐이라 오탐이 없다 — `dayjs().tz(KST).format()`은
      // `.format`의 피호출 객체가 `.tz(...)`라 아래 선택자에 걸리지 않는다.
      //
      // 한계: `dayjs().subtract(1,"year").format(...)`처럼 중간 단계를 거치는 체인은 못 잡는다
      // (자손 선택자로 넓히면 올바른 `.tz()` 체인까지 오탐이 난다). 그런 형태는 리뷰로 거른다.
      "no-restricted-syntax": [
        "error",
        {
          // ① 인자 없이도 타임존에 휘둘리는 연산 — 항상 금지
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='CallExpression'][callee.object.callee.name='dayjs'][callee.object.arguments.length=0][callee.property.name=/^(format|startOf|endOf|date|month|year|day)$/]",
          message:
            "tz 없는 dayjs()로 날짜를 다루면 서버(UTC)와 브라우저(KST)의 '오늘'이 갈립니다. @/lib/dayjs의 nowKST()·todayKST()·todayStartKST()를 쓰세요. (절대시각 저장 dayjs().toISOString()은 그대로 두면 됩니다.)",
        },
        {
          // ② 비교·차이는 **단위가 날짜일 때만** 위험하다.
          //    `dayjs().diff(x, "minute")`은 두 절대시각의 경과시간이라 어느 타임존에서 재도
          //    같은 값이 나온다(알림 "N분 전"이 그 예다). 반면 `diff(x, "day")`는 달력 날짜를
          //    세는 것이라 서 있는 자리가 답을 바꾼다. 단위로 갈라야 오탐 없이 진짜만 잡힌다.
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.type='CallExpression'][callee.object.callee.name='dayjs'][callee.object.arguments.length=0][callee.property.name=/^(diff|isSame|isBefore|isAfter)$/][arguments.1.value=/^(d|day|days|w|week|weeks|M|month|months|y|year|years)$/]",
          message:
            "날짜 단위 비교는 KST로 고정해야 합니다 — 서버(UTC)와 브라우저(KST)의 '오늘'이 달라 하루가 어긋납니다. @/lib/dayjs의 todayStartKST()·nowKST()를 쓰고, 상대편 date 문자열은 parseEventTime()으로 KST 자정에 고정하세요.",
        },
      ],
    },
  },
  // `lib/dayjs.ts`는 dayjs를 감싸 KST 규약을 세우는 **정본**이라, 여기서만 원본을 들여온다.
  // (이 예외가 없으면 규칙이 자기 자신의 구현을 막는다.) flat config는 뒤 블록이 이기므로
  // **위 규칙 블록보다 아래**에 둬야 한다.
  {
    files: ["lib/dayjs.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
];

export default eslintConfig;
