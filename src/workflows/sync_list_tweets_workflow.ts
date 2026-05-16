/**
 * ---
 * name: Sync List Tweets
 * description: "Read new tweets from user-created X.com lists and save them for de-duplication"
 *
 * use when:
 * - Scheduled job needs to refresh tweets from prepared X.com lists
 * - User wants to sync tweets from one or more X.com lists
 *
 *
 * cron:
 * - 0 *\\/4 * * *
 *
 * input:
 * - name: interest
 *   description: Optional interest area used to filter saved lists
 *   required: false
 * - name: listIds
 *   description: Optional array of X.com list IDs to sync
 *   required: false
 * - name: limit
 *   description: Number of tweets to read per list
 *   required: false
 *
 * output:
 * - success: bool
 * - message: string
 * - data: sync summary
 * ---
 */

import { Agent, type WorkflowContext } from '@greaseclaw/workflow-sdk';
import { syncListTweets } from '../shared';

export async function execute(context: WorkflowContext) {
  const agent = new Agent(context.agentOptions || {});
  const params = context.params || {};

  const result = await syncListTweets(agent, {
    interest: typeof params.interest === 'string' ? params.interest : undefined,
    listIds: Array.isArray(params.listIds) ? params.listIds.map(String) : undefined,
    lists: Array.isArray(params.lists) ? params.lists : undefined,
    limit: typeof params.limit === 'number' ? params.limit : undefined,
  });

  return {
    success: result.success,
    message: result.message,
    data: {
      ...result,
      page: agent.getPageLink('tweets', { interest: result.interest }),
    },
  };
}

// @ts-ignore
globalThis.execute = execute;