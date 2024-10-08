import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addEdge,
  ColorMode,
  Edge,
  OnConnect,
  OnConnectStartParams,
  ReactFlow,
  ReactFlowInstance,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import { nodeTypes } from "../../pages/canvas/components/nodes";
import { edgeTypes } from "../../pages/canvas/components/edges";
import { AppNode } from "../../pages/canvas/components/nodes/types";
import { Container, ReactFlowWrapper } from "./styles";
import { WhatsAppSidebar } from "../../pages/canvas/components/sidebars/whatsapp";
import { useDnD } from "../dnd";
import { DefaultProviderProps } from "../@interfaces";
import { FlowModel, NodeOption } from "../../models";
import { ManagersModule } from "../../managers/managers.module";
import { Nullable } from "../../@types";

interface DesignerContextProps {
  readonly nodeEntered?: AppNode;
  readonly connectStartParams?: OnConnectStartParams;
  readonly edges: Edge[];
  readonly getHandles: () => JSX.Element[];

  readonly autosave: boolean;
  readonly handleAutosave: (value: boolean) => void;

  readonly flow: Nullable<FlowModel>;
  readonly setFlow: (value: Nullable<FlowModel>) => void;

  readonly flows: FlowModel[];

  readonly addOption: (designerId: string) => Promise<void>;
  readonly deleteOption: (option: NodeOption) => Promise<void>;
  readonly handleNodeOptionText: (
    nodeId: string,
    optionId: string,
    text: string
  ) => Promise<void>;

  readonly handleNodeText: (nodeId: string, text: string) => Promise<void>;
}

export const DesignerContext = React.createContext<DesignerContextProps>(null!);

export function DesignerProvider(props: DefaultProviderProps) {
  const designerManager = ManagersModule.getInstance().getDesignerManager();

  const reactFlowWrapper = useRef(null);

  const [autosave, setAutosave] = useState(false);
  const [colorMode] = useState<ColorMode>("dark");
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<AppNode>>();

  // remove it from here
  const [flow, setFlow] = useState<Nullable<FlowModel>>();
  const [flows, setFlows] = useState<FlowModel[]>([]);
  // remove it from here

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { setViewport, screenToFlowPosition } = useReactFlow();
  const { type } = useDnD();

  const [nodeEntered, setNodeEntered] = useState<AppNode | undefined>(
    undefined
  );
  const [connectStartParams, setConnectStartParams] =
    useState<OnConnectStartParams>();

  const onConnect: OnConnect = useCallback(
    async (connection) => {
      const edge = await designerManager.createEdge(connection);

      setEdges((edges) => addEdge(edge.toInstance(), edges));
    },
    [designerManager, setEdges]
  );

  const loadData = useCallback(async () => {
    // loadFlows
    const flows = await designerManager.listFlows();

    setFlow(undefined);
    setFlows(flows);

    // load autosave
    const autosavePreference = await designerManager.getAutosave();
    setAutosave(autosavePreference);
  }, [designerManager]);

  const onNodeMouseEnter = (_event: unknown, node: AppNode) =>
    setNodeEntered(node);

  const onNodeMouseLeave = () => setNodeEntered(undefined);

  const onConnectStart = (_event: unknown, params: OnConnectStartParams) => {
    setConnectStartParams(params);
  };

  const onConnectEnd = () => {
    setConnectStartParams(undefined);
  };

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = await designerManager.createNode(position, type);

      setNodes((nds) => nds.concat(newNode.toInstance()));
    },
    [designerManager, screenToFlowPosition, setNodes, type]
  );

  const handleFlowSave = useCallback(async () => {
    if (rfInstance) {
      const flow = rfInstance.toObject();

      await designerManager.save(flow);

      loadData();
    }
  }, [designerManager, rfInstance, loadData]);

  const handleFlowDelete = useCallback(
    async (uuid: string) => {
      await designerManager.deleteFlow(uuid);

      setNodes([]);
      setEdges([]);

      setFlow((current) => (current?.uuid !== uuid ? current : undefined));
      setFlows((current) => current.filter((f) => f.uuid !== uuid));
    },
    [designerManager, setEdges, setNodes]
  );

  const handleFlowRestore = useCallback(
    (uuid: string) => {
      const restoreFlow = async (uuid: string) => {
        const { flow, nodes, edges } = await designerManager.loadFlow(uuid);

        if (flow) {
          setNodes(nodes.map((n) => n.toInstance()));
          setEdges(
            edges.map((e) => {
              return {
                id: e.designerId,
                type: e.type,
                animated: e.animated,
                source: e.source,
                sourceHandle: e.sourceHandle,
                target: e.target,
                targetHandle: e.targetHandle,
              } as Edge;
            })
          );
          setViewport(flow.viewport);
        }
      };

      restoreFlow(uuid);
    },
    [designerManager, setEdges, setNodes, setViewport]
  );

  const getHandles = useCallback((): JSX.Element[] => {
    // handleFactory.createHandles()

    return [];
  }, []);

  const onInit = (reactFlowInstance: ReactFlowInstance<AppNode>): void => {
    setRfInstance(reactFlowInstance);

    designerManager.reset();
  };

  const handleNewFlow = async () => {
    designerManager.reset();
    const autosavedFlow = await designerManager.newFlow();

    setFlow(autosavedFlow.flow);
    setFlows((current) => [...current, autosavedFlow.flow]);
    setNodes([]);
    setEdges([]);
  };

  const onNodeDragStop = async (
    _event: React.MouseEvent,
    _node: AppNode,
    nodes: AppNode[]
  ) => {
    await designerManager.updateNodePosition(nodes);
  };

  const handleAutosave = useCallback(
    async (value: boolean) => {
      await designerManager.setAutosave(value);
      setAutosave(value);
    },
    [designerManager]
  );

  const onDelete = async ({
    nodes,
    edges,
  }: {
    nodes: AppNode[];
    edges: Edge[];
  }) => {
    if (nodes.length > 0) {
      const designerIds = nodes.map((n) => n.id);
      await designerManager.deleteNodes(designerIds);
    }

    if (edges.length > 0) {
      const designerIds = edges.map((e) => e.id);
      await designerManager.deleteEdges(designerIds);
    }
  };

  const toggleAutosave = useCallback(
    async (value: boolean) => {
      if (value) {
        const autosavedFlow = await designerManager.setAutosave(value);

        if (autosavedFlow) {
          setFlow((current) =>
            current?.uuid !== autosavedFlow.uuid ? autosavedFlow : current
          );

          setFlows((current) => [
            ...current.filter((each) => each.uuid !== autosavedFlow.uuid),
            autosavedFlow,
          ]);
        }
      }
    },
    [designerManager]
  );

  const addOption = useCallback(
    async (designerId: string) => {
      const node = nodes.find((n) => n.id === designerId);

      if (node) {
        const option = await designerManager.createOption(node.id);

        node.data.options.push(option);

        setNodes((current) => {
          return [...current.filter((n) => n.id !== designerId), node];
        });
      }
    },
    [designerManager, nodes, setNodes]
  );

  const deleteOption = useCallback(
    async (option: NodeOption) => {
      const node = nodes.find((n) => n.id === option.nodeDesignerId);

      if (node) {
        await designerManager.deleteOption(option);

        const nodeIndex = node.data.options.findIndex(
          (o) => o.designerId === option.designerId
        );

        if (nodeIndex > -1) {
          node.data.options.splice(nodeIndex, 1);

          setNodes((current) => {
            return [
              ...current.filter((n) => n.id !== option.nodeDesignerId),
              node,
            ];
          });
        }
      }
    },
    [designerManager, nodes, setNodes]
  );

  const handleNodeText = useCallback(
    async (nodeId: string, text: string) => {
      const node = nodes.find((n) => n.id === nodeId);

      if (node) {
        node.data = { options: node?.data.options, text: text };

        await designerManager.updateNodeData(nodeId, node.data);

        setNodes((current) => {
          return [...current.filter((n) => n.id !== nodeId), node];
        });
      }
    },
    [designerManager, nodes, setNodes]
  );

  const handleNodeOptionText = useCallback(
    async (nodeId: string, optionId: string, text: string) => {
      const node = nodes.find((n) => n.id === nodeId);

      if (node) {
        const option = node.data.options.find((o) => o.designerId === optionId);

        if (option) {
          option.label = text;

          await designerManager.updateNodeData(nodeId, node.data);

          setNodes((current) => {
            return [...current.filter((n) => n.id !== nodeId), node];
          });
        }
      }
    },
    [designerManager, nodes, setNodes]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    toggleAutosave(autosave);
  }, [autosave, designerManager, setFlow, setFlows, toggleAutosave]);

  const value = useMemo(
    () => ({
      nodeEntered,
      connectStartParams,
      edges,
      autosave,
      flow,
      flows,
      setFlow,
      getHandles,
      addOption,
      handleNodeText,
      handleAutosave,
      deleteOption,
      handleNodeOptionText,
    }),
    [
      nodeEntered,
      connectStartParams,
      edges,
      autosave,
      flow,
      flows,
      getHandles,
      addOption,
      handleNodeText,
      handleAutosave,
      deleteOption,
      handleNodeOptionText,
    ]
  );

  return (
    <DesignerContext.Provider value={value}>
      <Container>
        <ReactFlowWrapper ref={reactFlowWrapper}>
          <ReactFlow
            fitView
            onInit={onInit}
            elementsSelectable
            deleteKeyCode="Delete"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onConnect={onConnect}
            colorMode={colorMode}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDelete={onDelete}
          >
            {props.children}
          </ReactFlow>
        </ReactFlowWrapper>
        <WhatsAppSidebar
          onSave={handleFlowSave}
          onCreate={handleNewFlow}
          onRestore={handleFlowRestore}
          onDelete={handleFlowDelete}
        />
      </Container>
    </DesignerContext.Provider>
  );
}
