/*
Copyright 2026 Element Creations Ltd.
Copyright 2024 New Vector Ltd.
Copyright 2021, 2022 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, {
    type ComponentProps,
    type Dispatch,
    type ReactNode,
    type RefCallback,
    type SetStateAction,
    type JSX,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useContext,
    useSyncExternalStore,
} from "react";
import { DragDropContext, Draggable, Droppable, type DroppableProvidedProps } from "react-beautiful-dnd";
import classNames from "classnames";
import { type Room } from "matrix-js-sdk/src/matrix";
import {
    ChatSolidIcon,
    RoomIcon,
    VideoCallSolidIcon,
    PlusIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useCreateAutoDisposedViewModel, UserMenu } from "@element-hq/web-shared-components";

import { _t } from "../../../languageHandler";
import { useContextMenu } from "../../structures/ContextMenu";
import SpaceCreateMenu from "./SpaceCreateMenu";
import { SpaceButton, SpaceItem } from "./SpaceTreeLevel";
import { useEventEmitterState } from "../../../hooks/useEventEmitter";
import {
    getMetaSpaceName,
    MetaSpace,
    type SpaceKey,
    UPDATE_INVITED_SPACES,
    UPDATE_SELECTED_SPACE,
    UPDATE_TOP_LEVEL_SPACES,
} from "../../../stores/spaces";
import { RovingTabIndexProvider } from "../../../accessibility/RovingTabIndex";
import SettingsStore from "../../../settings/SettingsStore";
import UIStore from "../../../stores/UIStore";
import QuickSettingsButton from "./QuickSettingsButton";
import IndicatorScrollbar from "../../structures/IndicatorScrollbar";
import { useDispatcher } from "../../../hooks/useDispatcher";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { type ActionPayload } from "../../../dispatcher/payloads";
import { Action } from "../../../dispatcher/actions";
import { KeyBindingAction } from "../../../accessibility/KeyboardShortcuts";
import { getKeyBindingsManager } from "../../../KeyBindingsManager";
import { shouldShowComponent } from "../../../customisations/helpers/UIComponents";
import { UIComponent } from "../../../settings/UIFeature";
import { ThreadsActivityCentre } from "./threads-activity-centre/";
import AccessibleButton from "../elements/AccessibleButton";
import { Landmark, LandmarkNavigation } from "../../../accessibility/LandmarkNavigation";
import { KeyboardShortcut } from "../settings/KeyboardShortcut";
import { ModuleApi } from "../../../modules/Api.ts";
import { useModuleSpacePanelItems } from "../../../modules/ExtrasApi.ts";
import { UserMenuViewModel } from "../../../viewmodels/menus/UserMenuViewModel.ts";
import { SDKContext } from "../../../contexts/SDKContext.ts";
import { OwnProfileStore } from "../../../stores/OwnProfileStore.ts";
import { type ResizerViewModel } from "../../../viewmodels/structures/ResizerViewModel.ts";
import { SpacePanelRooms } from "./SpacePanelRooms.tsx";
import { UserVoiceDock } from "./UserVoiceDock.tsx";

const noopUnsubscribe = (): void => {};
const noopSubscribe = (): (() => void) => noopUnsubscribe;
const getUndefinedSnapshot = (): undefined => undefined;
const noopSetCollapsed: Dispatch<SetStateAction<boolean>> = () => {};

function useOptionalResizerCollapsed(resizer?: ResizerViewModel): boolean | undefined {
    const snapshot = useSyncExternalStore(
        resizer ? resizer.subscribe : noopSubscribe,
        resizer ? resizer.getSnapshot : getUndefinedSnapshot,
        resizer ? resizer.getSnapshot : getUndefinedSnapshot,
    );
    return snapshot?.isCollapsed;
}

const useSpaces = (): [Room[], MetaSpace[], Room[], SpaceKey] => {
    const sdkContext = useContext(SDKContext);
    const invites = useEventEmitterState<Room[]>(sdkContext.spaceStore, UPDATE_INVITED_SPACES, () => {
        return sdkContext.spaceStore.invitedSpaces;
    });
    const [metaSpaces, actualSpaces] = useEventEmitterState<[MetaSpace[], Room[]]>(
        sdkContext.spaceStore,
        UPDATE_TOP_LEVEL_SPACES,
        () => [sdkContext.spaceStore.enabledMetaSpaces, sdkContext.spaceStore.spacePanelSpaces],
    );
    const activeSpace = useEventEmitterState<SpaceKey>(sdkContext.spaceStore, UPDATE_SELECTED_SPACE, () => {
        return sdkContext.spaceStore.activeSpace;
    });
    return [invites, metaSpaces, actualSpaces, activeSpace];
};

interface IMetaSpaceButtonProps extends ComponentProps<typeof SpaceButton> {
    selected: boolean;
    isPanelCollapsed: boolean;
    icon: JSX.Element;
}

type MetaSpaceButtonProps = Pick<IMetaSpaceButtonProps, "selected" | "isPanelCollapsed">;

const MetaSpaceButton: React.FC<IMetaSpaceButtonProps> = ({ selected, isPanelCollapsed, size = "32px", ...props }) => {
    return (
        <li
            className={classNames("mx_SpaceItem", {
                collapsed: isPanelCollapsed,
            })}
            role="treeitem"
            aria-selected={selected}
        >
            <SpaceButton {...props} selected={selected} isNarrow={isPanelCollapsed} size={size} />
        </li>
    );
};

const HomeButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    return (
        <MetaSpaceButton
            spaceKey={MetaSpace.Home}
            selected={selected}
            isPanelCollapsed={isPanelCollapsed}
            label={getMetaSpaceName(MetaSpace.Home)}
            notificationState={sdkContext.spaceStore.getNotificationState(MetaSpace.Home)}
            size="32px"
            icon={<ChatSolidIcon />}
        />
    );
};

const OrphansButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    return (
        <MetaSpaceButton
            spaceKey={MetaSpace.Orphans}
            selected={selected}
            isPanelCollapsed={isPanelCollapsed}
            label={getMetaSpaceName(MetaSpace.Orphans)}
            notificationState={sdkContext.spaceStore.getNotificationState(MetaSpace.Orphans)}
            size="32px"
            icon={<RoomIcon />}
        />
    );
};

const VideoRoomsButton: React.FC<MetaSpaceButtonProps> = ({ selected, isPanelCollapsed }) => {
    const sdkContext = useContext(SDKContext);
    return (
        <MetaSpaceButton
            spaceKey={MetaSpace.VideoRooms}
            selected={selected}
            isPanelCollapsed={isPanelCollapsed}
            label={getMetaSpaceName(MetaSpace.VideoRooms)}
            notificationState={sdkContext.spaceStore.getNotificationState(MetaSpace.VideoRooms)}
            size="32px"
            icon={<VideoCallSolidIcon />}
        />
    );
};

const CreateSpaceButton: React.FC<Pick<IInnerSpacePanelProps, "isPanelCollapsed" | "setPanelCollapsed">> = ({
    isPanelCollapsed,
    setPanelCollapsed,
}) => {
    const [menuDisplayed, handle, openMenu, closeMenu] = useContextMenu<HTMLDivElement>();

    useEffect(() => {
        if (!isPanelCollapsed && menuDisplayed) {
            closeMenu();
        }
    }, [isPanelCollapsed]); // eslint-disable-line react-hooks/exhaustive-deps

    let contextMenu: JSX.Element | undefined;
    if (menuDisplayed) {
        contextMenu = <SpaceCreateMenu onFinished={closeMenu} />;
    }

    const onNewClick = menuDisplayed
        ? closeMenu
        : () => {
              if (!isPanelCollapsed) setPanelCollapsed(true);
              openMenu();
          };

    return (
        <li
            className={classNames("mx_SpaceItem mx_SpaceItem_new", {
                collapsed: isPanelCollapsed,
            })}
            role="treeitem"
            aria-selected={false}
        >
            <SpaceButton
                data-testid="create-space-button"
                className={classNames("mx_SpaceButton_new", {
                    mx_SpaceButton_newCancel: menuDisplayed,
                })}
                label={menuDisplayed ? _t("action|cancel") : _t("create_space|label")}
                onClick={onNewClick}
                isNarrow={isPanelCollapsed}
                innerRef={handle}
                size="32px"
                icon={<PlusIcon />}
            />

            {contextMenu}
        </li>
    );
};

const metaSpaceComponentMap: Record<MetaSpace, typeof HomeButton> = {
    [MetaSpace.Home]: HomeButton,
    [MetaSpace.Orphans]: OrphansButton,
    [MetaSpace.VideoRooms]: VideoRoomsButton,
};

interface IInnerSpacePanelProps extends DroppableProvidedProps {
    children?: ReactNode;
    isPanelCollapsed: boolean;
    setPanelCollapsed: Dispatch<SetStateAction<boolean>>;
    isDraggingOver: boolean;
    innerRef: RefCallback<HTMLElement>;
}

// Optimisation based on https://github.com/atlassian/react-beautiful-dnd/blob/master/docs/api/droppable.md#recommended-droppable--performance-optimisation
const InnerSpacePanel = React.memo<IInnerSpacePanelProps>(
    ({ children, isPanelCollapsed, setPanelCollapsed, isDraggingOver, innerRef, ...props }) => {
        const sdkContext = useContext(SDKContext);
        const [invites, metaSpaces, actualSpaces, activeSpace] = useSpaces();
        const activeSpaces = activeSpace ? [activeSpace] : [];

        const moduleSpaceItems = useModuleSpacePanelItems(ModuleApi.instance.extras);

        const metaSpacesSection = metaSpaces
            .filter((key) => !(key === MetaSpace.VideoRooms && !SettingsStore.getValue("feature_video_rooms")))
            .map((key) => {
                const Component = metaSpaceComponentMap[key];
                return <Component key={key} selected={activeSpace === key} isPanelCollapsed={isPanelCollapsed} />;
            });

        return (
            <IndicatorScrollbar
                {...props}
                wrappedRef={innerRef}
                className="mx_SpaceTreeLevel"
                style={
                    isDraggingOver
                        ? {
                              pointerEvents: "none",
                          }
                        : undefined
                }
                as="ul"
                role="tree"
                aria-label={_t("common|spaces")}
            >
                {metaSpacesSection}
                {invites.map((s) => (
                    <SpaceItem
                        key={s.roomId}
                        space={s}
                        activeSpaces={activeSpaces}
                        isPanelCollapsed={isPanelCollapsed}
                        onExpand={() => setPanelCollapsed(false)}
                    />
                ))}
                {actualSpaces.map((s, i) => (
                    <Draggable key={s.roomId} draggableId={s.roomId} index={i}>
                        {(provided, snapshot) => (
                            <SpaceItem
                                {...provided.draggableProps}
                                dragHandleProps={provided.dragHandleProps}
                                key={s.roomId}
                                innerRef={provided.innerRef}
                                className={snapshot.isDragging ? "mx_SpaceItem_dragging" : undefined}
                                space={s}
                                activeSpaces={activeSpaces}
                                isPanelCollapsed={isPanelCollapsed}
                                onExpand={() => setPanelCollapsed(false)}
                            />
                        )}
                    </Draggable>
                ))}
                {children}
                {moduleSpaceItems.map((item) => (
                    <li
                        key={item.spaceKey}
                        className={classNames("mx_SpaceItem", {
                            collapsed: isPanelCollapsed,
                        })}
                        role="treeitem"
                        aria-selected={false} // TODO
                    >
                        <SpaceButton
                            {...item}
                            isNarrow={isPanelCollapsed}
                            size="32px"
                            selected={activeSpace === item.spaceKey}
                            onClick={() => {
                                sdkContext.spaceStore.setActiveSpace(item.spaceKey);
                                item.onSelected?.();
                            }}
                        />
                    </li>
                ))}
                {shouldShowComponent(UIComponent.CreateSpaces) && (
                    <CreateSpaceButton isPanelCollapsed={isPanelCollapsed} setPanelCollapsed={setPanelCollapsed} />
                )}
            </IndicatorScrollbar>
        );
    },
);

interface SpacePanelProps {
    /** The room list's resizer. Its rooms are listed here while it is collapsed. */
    resizer?: ResizerViewModel;
}

/**
 * Horizontal Spaces header strip rendered at the top of the unified expanded LeftPanel.
 */
export const SpaceHeaderBar: React.FC<SpacePanelProps> = ({ resizer }) => {
    const sdkContext = useContext(SDKContext);
    const isResizerCollapsed = useOptionalResizerCollapsed(resizer);
    const [invites, metaSpaces, actualSpaces, activeSpace] = useSpaces();
    const moduleSpaceItems = useModuleSpacePanelItems(ModuleApi.instance.extras);

    if (isResizerCollapsed === true) return null;

    const activeSpaces = activeSpace ? [activeSpace] : [];
    const metaSpacesSection = metaSpaces
        .filter((key) => !(key === MetaSpace.VideoRooms && !SettingsStore.getValue("feature_video_rooms")))
        .map((key) => {
            const Component = metaSpaceComponentMap[key];
            return <Component key={key} selected={activeSpace === key} isPanelCollapsed={true} />;
        });

    return (
        <RovingTabIndexProvider handleHomeEnd handleLeftRight>
            {({ onKeyDownHandler }) => (
                <nav
                    className="mx_SpacePanel collapsed mx_SpaceHeaderBar"
                    aria-label={_t("common|spaces")}
                    data-testid="unified-space-header"
                    onKeyDown={onKeyDownHandler}
                >
                    <ul className="mx_SpaceHeaderBar_list" role="tree" aria-label={_t("common|spaces")}>
                        {metaSpacesSection}
                        {invites.map((s) => (
                            <SpaceItem key={s.roomId} space={s} activeSpaces={activeSpaces} isPanelCollapsed={true} />
                        ))}
                        {actualSpaces.map((s) => (
                            <SpaceItem key={s.roomId} space={s} activeSpaces={activeSpaces} isPanelCollapsed={true} />
                        ))}
                        {moduleSpaceItems.map((item) => (
                            <li
                                key={item.spaceKey}
                                className="mx_SpaceItem collapsed"
                                role="treeitem"
                                aria-selected={activeSpace === item.spaceKey}
                            >
                                <SpaceButton
                                    {...item}
                                    isNarrow={true}
                                    size="32px"
                                    selected={activeSpace === item.spaceKey}
                                    onClick={() => {
                                        sdkContext.spaceStore.setActiveSpace(item.spaceKey);
                                        item.onSelected?.();
                                    }}
                                />
                            </li>
                        ))}
                        {shouldShowComponent(UIComponent.CreateSpaces) && (
                            <CreateSpaceButton isPanelCollapsed={true} setPanelCollapsed={noopSetCollapsed} />
                        )}
                    </ul>
                    <div className="mx_SpaceHeaderBar_actions">
                        <ThreadsActivityCentre displayButtonLabel={false} />
                        {resizer && (
                            <button
                                type="button"
                                className="mx_SpaceHeaderBar_collapseButton"
                                onClick={() => resizer.toggleCollapse()}
                                aria-label={_t("action|collapse")}
                                title={_t("action|collapse")}
                                data-testid="unified-panel-collapse-button"
                            >
                                <ChevronLeftIcon width="18px" height="18px" />
                            </button>
                        )}
                    </div>
                </nav>
            )}
        </RovingTabIndexProvider>
    );
};

const SpacePanel: React.FC<SpacePanelProps> = ({ resizer }) => {
    const sdkContext = useContext(SDKContext);
    const client = sdkContext.client!;
    const [dragging, setDragging] = useState(false);
    const [isPanelCollapsed, setPanelCollapsed] = useState(true);
    const isResizerCollapsed = useOptionalResizerCollapsed(resizer);
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (ref.current) UIStore.instance.trackElementDimensions("SpacePanel", ref.current);
        return () => UIStore.instance.stopTrackingElementDimensions("SpacePanel");
    }, []);

    useDispatcher(defaultDispatcher, (payload: ActionPayload) => {
        if (payload.action === Action.ToggleSpacePanel) {
            if (resizer) {
                resizer.toggleCollapse();
            } else {
                setPanelCollapsed(!isPanelCollapsed);
            }
        }
    });

    const userMenuVm = useCreateAutoDisposedViewModel(
        () =>
            new UserMenuViewModel(
                { ownProfileStore: OwnProfileStore.instance },
                defaultDispatcher,
                client,
                isPanelCollapsed,
            ),
    );

    useDispatcher(defaultDispatcher, (payload) => {
        if (payload.action === Action.ToggleUserMenu) {
            userMenuVm.setOpen(!userMenuVm.getSnapshot().open);
        }
    });

    useEffect(() => {
        userMenuVm.setExpanded(!isPanelCollapsed);
    }, [userMenuVm, isPanelCollapsed]);

    // When the unified LeftPanel is expanded, SpaceHeaderBar + RoomListPanel + UserVoiceDock
    // render as one stretchable panel inside LeftResizablePanelView. Keep only the hidden
    // UserMenu popover anchor here so Action.ToggleUserMenu opens at the bottom-left.
    if (resizer && isResizerCollapsed === false) {
        return (
            <div className="mx_SpacePanel_userMenuAnchor" data-testid="space-panel-user-menu-anchor">
                <UserMenu vm={userMenuVm} className="mx_UserMenu" />
            </div>
        );
    }

    const effectiveCollapsed = resizer ? true : isPanelCollapsed;

    return (
        <RovingTabIndexProvider handleHomeEnd handleUpDown={!dragging}>
            {({ onKeyDownHandler, onDragEndHandler }) => (
                <DragDropContext
                    onDragStart={() => {
                        setDragging(true);
                    }}
                    onDragEnd={(result) => {
                        setDragging(false);
                        if (!result.destination) return; // dropped outside the list
                        sdkContext.spaceStore.moveRootSpace(result.source.index, result.destination.index);
                        onDragEndHandler();
                    }}
                >
                    <nav
                        className={classNames("mx_SpacePanel", {
                            collapsed: effectiveCollapsed,
                            mx_SpacePanel_unifiedRail: Boolean(resizer),
                        })}
                        onKeyDown={(ev) => {
                            const navAction = getKeyBindingsManager().getNavigationAction(ev);
                            if (
                                navAction === KeyBindingAction.NextLandmark ||
                                navAction === KeyBindingAction.PreviousLandmark
                            ) {
                                LandmarkNavigation.findAndFocusNextLandmark(
                                    Landmark.ACTIVE_SPACE_BUTTON,
                                    navAction === KeyBindingAction.PreviousLandmark,
                                );
                                ev.stopPropagation();
                                ev.preventDefault();
                                return;
                            }
                            onKeyDownHandler(ev);
                        }}
                        ref={ref}
                        aria-label={_t("common|spaces")}
                    >
                        <AccessibleButton
                            className={classNames("mx_SpacePanel_toggleCollapse", {
                                expanded: !effectiveCollapsed,
                            })}
                            onClick={() => {
                                if (resizer) {
                                    resizer.toggleCollapse();
                                } else {
                                    setPanelCollapsed(!isPanelCollapsed);
                                }
                            }}
                            title={effectiveCollapsed ? _t("action|expand") : _t("action|collapse")}
                            caption={
                                <KeyboardShortcut
                                    value={{ ctrlOrCmdKey: true, shiftKey: true, key: "d" }}
                                    className="mx_SpacePanel_Tooltip_KeyboardShortcut"
                                />
                            }
                        >
                            <ChevronRightIcon />
                        </AccessibleButton>
                        <Droppable droppableId="top-level-spaces">
                            {(provided, snapshot) => (
                                <InnerSpacePanel
                                    {...provided.droppableProps}
                                    isPanelCollapsed={effectiveCollapsed}
                                    setPanelCollapsed={setPanelCollapsed}
                                    isDraggingOver={snapshot.isDraggingOver}
                                    innerRef={provided.innerRef}
                                >
                                    {provided.placeholder}
                                </InnerSpacePanel>
                            )}
                        </Droppable>

                        {resizer && <SpacePanelRooms resizer={resizer} isPanelCollapsed={effectiveCollapsed} />}

                        <ThreadsActivityCentre displayButtonLabel={!effectiveCollapsed} />

                        {resizer ? (
                            <>
                                <UserVoiceDock isMinimized={true} />
                                <div className="mx_SpacePanel_userMenuAnchor">
                                    <UserMenu vm={userMenuVm} className="mx_UserMenu" />
                                </div>
                            </>
                        ) : (
                            <>
                                <QuickSettingsButton isPanelCollapsed={effectiveCollapsed} />
                                <UserMenu vm={userMenuVm} className="mx_UserMenu" />
                            </>
                        )}
                    </nav>
                </DragDropContext>
            )}
        </RovingTabIndexProvider>
    );
};

export default SpacePanel;
