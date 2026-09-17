export class CurrentView implements Module {
  getModule() {
    return {
      state: {
        info: "",
        param: "",
      },
      mutations: {
        changeView(
          state: { info: string; param: string },
          payload: string | { view: string; param?: string }
        ) {
          if (typeof payload === "string") {
            state.info = payload;
            state.param = "";
          } else {
            state.info = payload.view;
            state.param = payload.param ?? "";
          }
        },
      },
      namespaced: true,
    };
  }
}
