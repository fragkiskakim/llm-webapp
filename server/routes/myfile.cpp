#ifndef DCC_APPLICATION_H
#define DCC_APPLICATION_H

#include <string>
#include <vector>
#include <ctime>

// Forward declarations for cross-namespace dependencies
namespace Server {
    class ServerCoordinateService;
}

namespace Database {
    class DatabaseCoordinateRepository;
}

// =============================================================================
// Client Namespace - Frontend / UI Layer (Swing-like interaction)
// =============================================================================
namespace Client {

    class CartesianCoordinate {
    public:
        double x;
        double y;

        CartesianCoordinate();
        CartesianCoordinate(double x, double y);
        double getX() const;
        double getY() const;
        void setX(double x);
        void setY(double y);
    };

    class PolarCoordinate {
    public:
        double r;
        double theta;

        PolarCoordinate();
        PolarCoordinate(double r, double theta);
        double getR() const;
        double getTheta() const;
        void setR(double r);
        void setTheta(double theta);
    };

    class ClientCoordinateGroup {
    public:
        int id;
        std::string label;
        std::string timestamp;
        CartesianCoordinate cartesian;
        PolarCoordinate polar;

        ClientCoordinateGroup();
        int getId() const;
        void setId(int id);
        std::string getLabel() const;
        void setLabel(const std::string& label);
        std::string getTimestamp() const;
        void setTimestamp(const std::string& timestamp);
        CartesianCoordinate getCartesian() const;
        void setCartesian(const CartesianCoordinate& cartesian);
        PolarCoordinate getPolar() const;
        void setPolar(const PolarCoordinate& polar);
    };

    class ClientCoordinateConverter {
    public:
        static PolarCoordinate cartesianToPolar(const CartesianCoordinate& cartesian);
        static CartesianCoordinate polarToCartesian(const PolarCoordinate& polar);
    };

    class CoordinateInputPanel {
    private:
        std::string labelField;
        double xField;
        double yField;
        double rField;
        double thetaField;
        bool isCartesianInput;

    public:
        CoordinateInputPanel();
        void setLabel(const std::string& label);
        std::string getLabel() const;
        void setCartesianInput(double x, double y);
        void setPolarInput(double r, double theta);
        void setInputMode(bool cartesian);
        bool getInputMode() const;
        ClientCoordinateGroup buildCoordinateGroup() const;
        void populateFromGroup(const ClientCoordinateGroup& group);
        void clear();
    };

    class CoordinateListPanel {
    private:
        std::vector<ClientCoordinateGroup> displayedGroups;

    public:
        CoordinateListPanel();
        void setCoordinateGroups(const std::vector<ClientCoordinateGroup>& groups);
        std::vector<ClientCoordinateGroup> getDisplayedGroups() const;
        ClientCoordinateGroup getSelectedGroup() const;
        int getSelectedIndex() const;
        void refresh(const std::vector<ClientCoordinateGroup>& groups);
    };

    class ClientMainFrame {
    private:
        CoordinateInputPanel* inputPanel;
        CoordinateListPanel* listPanel;
        Server::ServerCoordinateService* coordinateService;

    public:
        ClientMainFrame(Server::ServerCoordinateService* service);
        ~ClientMainFrame();
        void initialize();
        void display();
        void onCreateCoordinateGroup();
        void onRetrieveByLabel(const std::string& label);
        void onRetrieveAll();
        void onModifyCoordinateGroup();
        void onDeleteCoordinateGroup();
        void showMessage(const std::string& message);
        void showError(const std::string& error);
    };

} // namespace Client

// =============================================================================
// Server Namespace - Business Logic / Service Layer
// =============================================================================
namespace Server {

    class ServerCartesianCoordinate {
    public:
        double x;
        double y;

        ServerCartesianCoordinate();
        ServerCartesianCoordinate(double x, double y);
        double getX() const;
        double getY() const;
        void setX(double x);
        void setY(double y);
    };

    class ServerPolarCoordinate {
    public:
        double r;
        double theta;

        ServerPolarCoordinate();
        ServerPolarCoordinate(double r, double theta);
        double getR() const;
        double getTheta() const;
        void setR(double r);
        void setTheta(double theta);
    };

    class ServerCoordinateGroup {
    public:
        int id;
        std::string label;
        std::string timestamp;
        ServerCartesianCoordinate cartesian;
        ServerPolarCoordinate polar;

        ServerCoordinateGroup();
        int getId() const;
        void setId(int id);
        std::string getLabel() const;
        void setLabel(const std::string& label);
        std::string getTimestamp() const;
        void setTimestamp(const std::string& timestamp);
        ServerCartesianCoordinate getCartesian() const;
        void setCartesian(const ServerCartesianCoordinate& cartesian);
        ServerPolarCoordinate getPolar() const;
        void setPolar(const ServerPolarCoordinate& polar);
    };

    class ServerCoordinateConverter {
    public:
        static ServerPolarCoordinate cartesianToPolar(const ServerCartesianCoordinate& cartesian);
        static ServerCartesianCoordinate polarToCartesian(const ServerPolarCoordinate& polar);
    };

    class ServerCoordinateValidator {
    public:
        static bool validateCartesian(double x, double y);
        static bool validatePolar(double r, double theta);
        static bool validateLabel(const std::string& label);
        static bool validateCoordinateGroup(const ServerCoordinateGroup& group);
    };

    class ServerCoordinateService {
    private:
        Database::DatabaseCoordinateRepository* repository;

    public:
        ServerCoordinateService(Database::DatabaseCoordinateRepository* repository);
        ~ServerCoordinateService();

        ServerCoordinateGroup createFromCartesian(double x, double y, const std::string& label);
        ServerCoordinateGroup createFromPolar(double r, double theta, const std::string& label);
        ServerCoordinateGroup getById(int id);
        std::vector<ServerCoordinateGroup> getByLabel(const std::string& label);
        std::vector<ServerCoordinateGroup> getAll();
        ServerCoordinateGroup updateCoordinateGroup(int id, const ServerCoordinateGroup& updatedGroup);
        bool deleteCoordinateGroup(int id);
    };

} // namespace Server

// =============================================================================
// Database Namespace - Persistence / Data Access Layer
// =============================================================================
namespace Database {

    class DatabaseConnectionConfig {
    public:
        std::string host;
        int port;
        std::string databaseName;
        std::string username;
        std::string password;

        DatabaseConnectionConfig();
        DatabaseConnectionConfig(const std::string& host, int port,
                                 const std::string& databaseName,
                                 const std::string& username,
                                 const std::string& password);
        std::string getHost() const;
        int getPort() const;
        std::string getDatabaseName() const;
        std::string getUsername() const;
        std::string getPassword() const;
    };

    class MySQLConnectionManager {
    private:
        DatabaseConnectionConfig config;
        void* connectionHandle; // opaque handle to MySQL connection
        bool connected;

    public:
        MySQLConnectionManager(const DatabaseConnectionConfig& config);
        ~MySQLConnectionManager();
        bool connect();
        bool disconnect();
        bool isConnected() const;
        void* getConnectionHandle() const;
    };

    class DatabaseCoordinateEntity {
    public:
        int id;
        std::string label;
        std::string timestamp;
        double cartesianX;
        double cartesianY;
        double polarR;
        double polarTheta;

        DatabaseCoordinateEntity();
        int getId() const;
        void setId(int id);
        std::string getLabel() const;
        void setLabel(const std::string& label);
        std::string getTimestamp() const;
        void setTimestamp(const std::string& timestamp);
        double getCartesianX() const;
        void setCartesianX(double x);
        double getCartesianY() const;
        void setCartesianY(double y);
        double getPolarR() const;
        void setPolarR(double r);
        double getPolarTheta() const;
        void setPolarTheta(double theta);
    };

    class DatabaseCoordinateMapper {
    public:
        static Server::ServerCoordinateGroup entityToServerGroup(const DatabaseCoordinateEntity& entity);
        static DatabaseCoordinateEntity serverGroupToEntity(const Server::ServerCoordinateGroup& group);
    };

    class DatabaseCoordinateRepository {
    private:
        MySQLConnectionManager* connectionManager;

    public:
        DatabaseCoordinateRepository(MySQLConnectionManager* connectionManager);
        ~DatabaseCoordinateRepository();

        DatabaseCoordinateEntity insert(const DatabaseCoordinateEntity& entity);
        DatabaseCoordinateEntity findById(int id);
        std::vector<DatabaseCoordinateEntity> findByLabel(const std::string& label);
        std::vector<DatabaseCoordinateEntity> findAll();
        DatabaseCoordinateEntity update(int id, const DatabaseCoordinateEntity& entity);
        bool deleteById(int id);
        bool exists(int id);
    };

} // namespace Database

#endif // DCC_APPLICATION_H