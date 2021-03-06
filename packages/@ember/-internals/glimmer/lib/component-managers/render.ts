import { RENDER_HELPER } from '@ember/deprecated-features';
import { ComponentCapabilities } from '@glimmer/interfaces';
import { CONSTANT_TAG, Tag, VersionedPathReference } from '@glimmer/reference';
import { Arguments, ComponentDefinition, Invocation, WithStaticLayout } from '@glimmer/runtime';

import { Owner } from '@ember/-internals/owner';
import { generateController, generateControllerFactory } from '@ember/-internals/routing';
import { OwnedTemplateMeta } from '@ember/-internals/views';
import { DEBUG } from '@glimmer/env';
import Environment from '../environment';
import { DynamicScope } from '../renderer';
import { OwnedTemplate } from '../template';
import { OrphanedOutletReference } from '../utils/outlet';
import { RootReference } from '../utils/references';
import AbstractManager from './abstract';

export interface RenderDefinitionState {
  name: string;
  template: OwnedTemplate;
}

export interface RenderState {
  controller: any;
}

export interface RenderStateWithModel extends RenderState {
  model: VersionedPathReference<any>;
}

let NON_SINGLETON_RENDER_MANAGER: any;
let SINGLETON_RENDER_MANAGER: any;
let RenderDefinition: {
  new (name: string, template: OwnedTemplate, manager: any): ComponentDefinition;
};

if (RENDER_HELPER) {
  abstract class AbstractRenderManager<T extends RenderState>
    extends AbstractManager<T, RenderDefinitionState>
    implements WithStaticLayout<T, RenderDefinitionState, OwnedTemplateMeta, any> {
    create(
      env: Environment,
      definition: RenderDefinitionState,
      args: Arguments,
      dynamicScope: DynamicScope
    ): T {
      let { name } = definition;

      if (DEBUG) {
        this._pushToDebugStack(`controller:${name} (with the render helper)`, env);
      }

      if (dynamicScope.rootOutletState) {
        dynamicScope.outletState = new OrphanedOutletReference(dynamicScope.rootOutletState, name);
      }

      return this.createRenderState(args, env.owner, name);
    }

    abstract createRenderState(args: Arguments, owner: Owner, name: string): T;

    getLayout({ template }: RenderDefinitionState): Invocation {
      const layout = template!.asLayout();
      return {
        handle: layout.compile(),
        symbolTable: layout.symbolTable,
      };
    }

    getSelf({ controller }: T) {
      return new RootReference(controller);
    }
  }

  if (DEBUG) {
    AbstractRenderManager.prototype.didRenderLayout = function() {
      this.debugStack.pop();
    };
  }

  const CAPABILITIES = {
    dynamicLayout: false,
    dynamicTag: false,
    prepareArgs: false,
    createArgs: false,
    attributeHook: false,
    elementHook: false,
    createCaller: true,
    dynamicScope: true,
    updateHook: true,
    createInstance: true,
  };

  class SingletonRenderManager extends AbstractRenderManager<RenderState> {
    createRenderState(_args: Arguments, owner: Owner, name: string) {
      let controller = owner.lookup<any>(`controller:${name}`) || generateController(owner, name);
      return { controller };
    }

    getCapabilities(_: RenderDefinitionState): ComponentCapabilities {
      return CAPABILITIES;
    }

    getTag(): Tag {
      // todo this should be the tag of the state args
      return CONSTANT_TAG;
    }

    getDestructor() {
      return null;
    }
  }

  SINGLETON_RENDER_MANAGER = new SingletonRenderManager();

  const NONSINGLETON_CAPABILITIES: ComponentCapabilities = {
    dynamicLayout: false,
    dynamicTag: false,
    prepareArgs: false,
    createArgs: true,
    attributeHook: false,
    elementHook: false,
    dynamicScope: true,
    createCaller: false,
    updateHook: true,
    createInstance: true,
  };

  class NonSingletonRenderManager extends AbstractRenderManager<RenderStateWithModel> {
    createRenderState(args: Arguments, owner: Owner, name: string) {
      let model = args.positional.at(1);
      let factory =
        owner.factoryFor(`controller:${name}`) ||
        generateControllerFactory(owner, `controller:${name}`);
      let controller = factory.create({ model: model.value() });
      return { controller, model };
    }

    update({ controller, model }: RenderStateWithModel) {
      controller.set('model', model.value());
    }

    getCapabilities(_: RenderDefinitionState): ComponentCapabilities {
      return NONSINGLETON_CAPABILITIES;
    }

    getTag({ model }: RenderStateWithModel): Tag {
      return model.tag;
    }

    getDestructor({ controller }: RenderStateWithModel) {
      return controller;
    }
  }

  NON_SINGLETON_RENDER_MANAGER = new NonSingletonRenderManager();

  RenderDefinition = class RenderDefinition implements ComponentDefinition {
    public state: RenderDefinitionState;

    constructor(
      name: string,
      template: OwnedTemplate,
      public manager: SingletonRenderManager | NonSingletonRenderManager
    ) {
      this.state = {
        name,
        template,
      };
    }
  };
}

export { RenderDefinition, NON_SINGLETON_RENDER_MANAGER, SINGLETON_RENDER_MANAGER };
