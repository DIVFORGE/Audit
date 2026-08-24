const SIGNAL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^\s*export\s+(default\s+)?(function|class|const|interface|type)\b/, reason: 'export added/changed' },
  { pattern: /^\s*import\s.+from\s/, reason: 'import changed' },
  { pattern: /^\s*(public|private|protected)?\s*(async\s+)?function\s+\w+\s*\(/, reason: 'function signature changed' },
  { pattern: /^\s*class\s+\w+/, reason: 'class declaration changed' },
  { pattern: /^\s*interface\s+\w+/, reason: 'interface changed' },
  { pattern: /^\s*(GET|POST|PUT|DELETE|PATCH)\s+['"`]/, reason: 'API route changed' },
  { pattern: /^\s*def\s+\w+\s*\(/, reason: 'function signature changed (python)' },

  // Java / C# / Kotlin — method signatures: (modifiers) returnType methodName(...)
  // e.g. "public void save(User user)", "private static int count()", "protected String getName()"
  {
    pattern: /^\s*(public|private|protected|internal)\s+(static\s+|final\s+|abstract\s+|override\s+|virtual\s+|async\s+|suspend\s+)*[\w<>\[\],.\s]+\s+\w+\s*\([^)]*\)\s*(\{|;|throws\b|:)/,
    reason: 'method signature changed (Java/C#/Kotlin)',
  },
  // Java/Kotlin/C# class or interface with modifiers, e.g. "public class Foo", "public interface Bar"
  { pattern: /^\s*(public|private|protected|internal)\s+(abstract\s+|final\s+|sealed\s+|static\s+)*(class|interface|enum|record)\s+\w+/, reason: 'class/interface declaration changed' },
  // Annotations that usually signal a structural/API change (Spring, JPA, etc.)
  { pattern: /^\s*@(RestController|RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|Entity|Table|Autowired|Service|Repository|Component|Bean)\b/, reason: 'annotation-driven structure changed' },

  // Go — func declarations, including methods with receivers
  { pattern: /^\s*func\s+(\([^)]*\)\s*)?\w+\s*\(/, reason: 'function signature changed (Go)' },
  { pattern: /^\s*type\s+\w+\s+(struct|interface)\b/, reason: 'type declaration changed (Go)' },

  // Rust — fn declarations and struct/trait/impl
  { pattern: /^\s*(pub\s+)?(async\s+)?fn\s+\w+\s*\(/, reason: 'function signature changed (Rust)' },
  { pattern: /^\s*(pub\s+)?(struct|trait|impl|enum)\s+\w+/, reason: 'type declaration changed (Rust)' },

  // PHP — function/class with visibility keywords beyond the generic "function" pattern above
  { pattern: /^\s*(abstract\s+|final\s+)?class\s+\w+.*\{?\s*$/, reason: 'class declaration changed (PHP)' },

  // C/C++ — function definitions (heuristic: returnType name(args) { )
  { pattern: /^\s*[\w:<>,\s\*&]+\s+\w+::\w+\s*\([^)]*\)\s*\{?\s*$/, reason: 'method definition changed (C++)' },
];

export function detectDesignChange(insertedText: string): { isDesignChange: boolean; reason?: string } {
  const lines = insertedText.split('\n');
  for (const line of lines) {
    for (const { pattern, reason } of SIGNAL_PATTERNS) {
      if (pattern.test(line)) {
        return { isDesignChange: true, reason };
      }
    }
  }
  return { isDesignChange: false };
}
