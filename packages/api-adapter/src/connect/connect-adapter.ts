import type { EventBus } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import { createConnectEventStreamHandlers } from './handlers/event-streaming';
import {
  createConnectMutationHandlers,
  createConnectQueryHandlers,
} from './handlers/queries-mutations';
import {
  CONNECT_SERVICE_DESCRIPTORS,
  PROTO_SERVICES_SDL,
  type ConnectServiceDescriptor,
} from './schema';

export type ConnectAdapterOptions = Readonly<{
  eventBus?: EventBus;
}>;

export type ConnectAdapterServices = Readonly<{
  nodeService: ReturnType<typeof createConnectQueryHandlers>;
  edgeService: ReturnType<typeof createConnectQueryHandlers>;
  propertyService: ReturnType<typeof createConnectQueryHandlers>;
  mutationService: ReturnType<typeof createConnectMutationHandlers>;
  eventStreamService: ReturnType<typeof createConnectEventStreamHandlers>;
}>;

export type ConnectAdapter = Readonly<{
  protoSdl: string;
  descriptors: readonly ConnectServiceDescriptor[];
  services: ConnectAdapterServices;
}>;

export const createConnectAdapter = (
  context: ApiAdapterContext,
  options?: ConnectAdapterOptions,
): ConnectAdapter => {
  const queryHandlers = createConnectQueryHandlers(context);
  const mutationHandlers = createConnectMutationHandlers(context);
  const eventStreamHandlers = createConnectEventStreamHandlers(context, options);

  return {
    protoSdl: PROTO_SERVICES_SDL,
    descriptors: CONNECT_SERVICE_DESCRIPTORS,
    services: {
      nodeService: queryHandlers,
      edgeService: queryHandlers,
      propertyService: queryHandlers,
      mutationService: mutationHandlers,
      eventStreamService: eventStreamHandlers,
    },
  };
};
