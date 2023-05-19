import {
  Offense,
  SourceCodeType,
  WithRequired,
} from '@shopify/theme-check-common';
import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Command,
  Diagnostic,
} from 'vscode-languageserver';
import { Anomaly } from '../../diagnostics';
import { BaseCodeActionsProvider } from '../BaseCodeActionsProvider';
import { isInRange, toCodeAction } from './utils';

export class SuggestionProvider extends BaseCodeActionsProvider {
  static kind = CodeActionKind.QuickFix;

  codeActions(params: CodeActionParams): (Command | CodeAction)[] {
    const { uri } = params.textDocument;
    const document = this.documentManager.get(uri);
    const diagnostics = this.diagnosticsManager.get(uri);
    if (!document || !diagnostics) return [];

    const { textDocument } = document;
    const { anomalies, version } = diagnostics;
    const start = textDocument.offsetAt(params.range.start);
    const end = textDocument.offsetAt(params.range.end);

    const suggestibleAnomalies = anomalies.filter(isSuggestible);
    const anomaliesUnderCursor = suggestibleAnomalies.filter((anomaly) =>
      isInRange(anomaly, start, end),
    );
    if (anomaliesUnderCursor.length === 0) return [];

    return quickfixCursorActions(uri, version, anomaliesUnderCursor);
  }
}

// I might want to fix all in a particular file
// uri, version, SuggestionId[]
//
// const diagnostics = this.diagnosticsManager.get(uri)
// const document = this.documentManager.get(uri)
// if (!document || !diagnostics || diagnostics.version !== version) return
//
// const suggestions = suggestionIds
//  .map(([anomalyId, suggestId]) => diagnostics.anomalies[anomalyId].offense.suggest[suggestId])
//
// const corrector = createCorrector(type, document.source);
//
// for (const collectFixes of suggestions) {
//   collectFixes(corrector);
// }
//
// const edits = applyFix(source, corrector.fix);
function applySuggestionCommand(
  uri: string,
  version: number | undefined,
  anomalyId: number,
  suggestionIndex: number,
): Command {
  return Command.create(
    'applySuggestion',
    'themeCheck/applySuggestion',
    uri,
    version,
    anomalyId,
    suggestionIndex,
  );
}

/**
 * @returns all Offense.suggest code actions for the offenses under the cursor
 * @example Suggestion: Add the `defer` HTML attribute
 */
function quickfixCursorActions(
  uri: string,
  version: number | undefined,
  anomaliesUnderCursor: SuggestibleAnomaly[],
): CodeAction[] {
  return anomaliesUnderCursor.flatMap(({ offense, diagnostic, id }) => {
    return offense.suggest.map((suggestion, suggestionId) =>
      toCodeAction(
        `Suggestion: ${suggestion.message}`,
        applySuggestionCommand(uri, version, id, suggestionId),
        [diagnostic],
        SuggestionProvider.kind,
      ),
    );
  });
}

/**
 * An anomaly is suggestible if the offense has the `suggest` attribute
 *
 * This type guarantees that Offense.suggest is defined
 */
type SuggestibleAnomaly<S extends SourceCodeType = SourceCodeType> =
  S extends SourceCodeType
    ? {
        diagnostic: Diagnostic;
        offense: WithRequired<Offense<S>, 'suggest'>;
        id: number;
      }
    : never;

function isSuggestible(anomaly: Anomaly): anomaly is SuggestibleAnomaly {
  const { offense } = anomaly;
  return 'suggest' in offense && offense.suggest !== undefined;
}
